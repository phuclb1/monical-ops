import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../../datetime";
import { ensureTodayRoomTasks } from "../../checklist-ops";
import { auditChanges } from "../../audit-view";
import {
  bookingKey,
  catalogRate,
  clampBreakfastPax,
  clampRoomAdults,
  roomAdultCap,
  isActiveSaleStatus,
  isOtaSource,
  isSaleSource,
  normalizeCommission,
  normalizeDiscount,
  rateForRoomMove,
  roomMoveKind,
} from "../../sales";
import type { SessionUser } from "../../types";
import { audit } from "../audit";
import { assertSaleWindow } from "./helpers";
import { notifyBookingChange } from "./notify";
import { bookingCheckinPaidReady } from "@/lib/zalo-templates";
import { dispatchBookingZalo, dispatchCheckinPaidZalo } from "@/lib/zalo-notify";
import { dispatchBookingWebhook, bookingWebhookRooms } from "@/lib/booking-webhook";
import { getBooking } from "./queries";
import { cancelRoomSale } from "./lifecycle";
import { syncBookingMoney } from "./money-sync";
import { syncStayFromSale } from "./stay";

export type BookingUpdateInput = {
  assignments: {
    saleId: string;
    roomId: string;
    checkIn?: string;
    checkOut?: string;
    breakfast?: boolean;
    adults?: number;
    children?: number;
    discountKind?: string;
    discountValue?: number;
  }[];
  guestName?: string;
  guestPhone?: string;
  source?: string;
  otaPaymentMode?: "debt" | "hotel";
  otaCommissionPercent?: number;
  otaCommissionKind?: "percent" | "amount";
  otaCommissionValue?: number;
  invoiceRequested?: boolean;
  adults?: number;
  children?: number;
  breakfastAdults?: number;
  breakfastChildren?: number;
  cars?: number;
  bikes?: number;
  discountKind?: string;
  discountValue?: number;
  deposit?: number;
  checkinPaid?: number;
  checkinPaymentMethod?: string;
  cashPaid?: number;
  transferPaid?: number;
  companyPaid?: number;
  paymentMethod?: string;
  notes?: string;
  removedSaleIds?: string[];
};

export async function updateBooking(
  user: SessionUser,
  bookingId: string,
  data: BookingUpdateInput,
) {
  const prior = await getBooking(bookingId);
  const wasPaidInhouse = prior ? bookingCheckinPaidReady(prior) : false;
  const db = await getDb();
  const key = prior?.id || bookingId;
  const [all, rooms, types] = await Promise.all([
    db.select().from(t.roomSales).where(or(eq(t.roomSales.bookingId, key), eq(t.roomSales.id, key))),
    db.select().from(t.rooms),
    db.select().from(t.roomTypes),
  ]);
  const hit = all.find((row) => row.id === bookingId || row.bookingId === bookingId || bookingKey(row) === key);
  if (!hit) throw new Error("Không tìm thấy booking");
  const active = all.filter((row) => bookingKey(row) === bookingKey(hit) && isActiveSaleStatus(row.status));
  if (!active.length) throw new Error("Booking đã đóng, không sửa");
  const guestName = data.guestName !== undefined ? data.guestName.trim() : hit.guestName;
  if (!guestName) throw new Error("Nhập tên khách");
  if (data.source !== undefined && data.source !== "" && !isSaleSource(data.source)) throw new Error("Chọn nền tảng booking");
  const source = data.source && isSaleSource(data.source) ? data.source : hit.source;
  const otaPaymentMode =
    data.otaPaymentMode === undefined
      ? hit.otaPaymentMode === "hotel" ? "hotel" : "debt"
      : data.otaPaymentMode === "hotel" ? "hotel" : "debt";
  const commission = normalizeCommission(
    isOtaSource(source),
    data.otaCommissionKind ?? hit.otaCommissionKind,
    data.otaCommissionValue ?? (hit.otaCommissionValue || hit.otaCommissionPercent || 0),
  );
  const guestPhone = data.guestPhone !== undefined ? data.guestPhone.trim() || null : hit.guestPhone;
  const cars = Math.max(0, data.cars ?? hit.cars ?? 0);
  const bikes = Math.max(0, data.bikes ?? hit.bikes ?? 0);
  const notes = data.notes !== undefined ? data.notes.trim() || null : undefined;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const nextBySale = new Map(data.assignments.map((row) => [row.saleId, row]));
  const removeIds = [...new Set((data.removedSaleIds || []).map((id) => id.trim()).filter(Boolean))];
  const activeIds = new Set(active.map((row) => row.id));
  for (const id of removeIds) {
    if (!activeIds.has(id)) throw new Error("Không tìm thấy phòng cần xóa trong booking");
  }
  if (removeIds.length >= active.length) throw new Error("Giữ ít nhất một phòng. Hủy cả booking nếu không còn phòng nào.");
  const removeSet = new Set(removeIds);
  const staying = active.filter((row) => !removeSet.has(row.id));
  const typeAdults = new Map(types.map((type) => [type.name, type.adults]));
  const stayingPax = staying.map((row) => {
    const assignment = nextBySale.get(row.id);
    const nextRoom = roomById.get(assignment?.roomId || row.roomId);
    const cap = roomAdultCap(nextRoom?.type || "", typeAdults.get(nextRoom?.type || ""));
    return {
      adults: clampRoomAdults(assignment?.adults ?? row.adults, cap),
      children: Math.max(0, Math.round(Number(assignment?.children ?? row.children) || 0)),
    };
  });
  const adults = stayingPax.reduce((sum, row) => sum + row.adults, 0);
  const children = stayingPax.reduce((sum, row) => sum + row.children, 0);
  const hasBreakfast = staying.some((row) => {
    const assignment = nextBySale.get(row.id);
    return assignment?.breakfast ?? row.breakfast !== false;
  });
  const breakfastPax = clampBreakfastPax(
    adults,
    children,
    data.breakfastAdults ?? hit.breakfastAdults,
    data.breakfastChildren ?? hit.breakfastChildren,
    hasBreakfast,
  );
  const seen = new Set<string>();
  const now = nowISO();
  const today = todayVN();
  for (const [index, row] of staying.entries()) {
    const pax = stayingPax[index];
    const assignment = nextBySale.get(row.id);
    const nextRoomId = assignment?.roomId || row.roomId;
    if (seen.has(nextRoomId)) throw new Error("Hai chỗ trong booking không được trùng số phòng");
    seen.add(nextRoomId);
    const current = roomById.get(row.roomId);
    if (!current) throw new Error("Không tìm thấy phòng hiện tại");
    const nextIn = row.status === "reserved" && assignment?.checkIn ? assignment.checkIn : row.checkIn;
    const nextOut = assignment?.checkOut || row.checkOut;
    if (nextOut <= nextIn) throw new Error("Ngày trả phải sau ngày nhận");
    if (row.status === "inhouse" && nextOut < today) throw new Error("Ngày trả không được trước hôm nay");
    const next = await assertSaleWindow(nextRoomId, nextIn, nextOut, active.map((item) => item.id));
    const kind = roomMoveKind(current.type, next.type, types);
    if (!kind) throw new Error(`P.${next.number} không thuộc hạng phòng đã khai báo`);
    const nextRate = rateForRoomMove(
      kind,
      catalogRate(types.find((type) => type.name === next.type), nextIn),
      row.rate,
      isOtaSource(source),
    );
    const { discountKind, discountValue } = normalizeDiscount(
      assignment?.discountKind ?? row.discountKind,
      assignment?.discountValue ?? row.discountValue,
    );
    const patch = {
      roomId: next.id,
      guestName,
      guestPhone,
      source,
      otaPaymentMode,
      ...commission,
      invoiceRequested: data.invoiceRequested ?? hit.invoiceRequested,
      adults: pax.adults,
      children: pax.children,
      breakfastAdults: breakfastPax.adults,
      breakfastChildren: breakfastPax.children,
      cars,
      bikes,
      rate: nextRate,
      checkIn: nextIn,
      checkOut: nextOut,
      breakfast: assignment?.breakfast ?? row.breakfast !== false,
      discountKind,
      discountValue,
      ...(notes !== undefined ? { notes } : {}),
      updatedAt: now,
      updatedBy: user.id,
    };
    const after = { ...row, ...patch };
    await db.update(t.roomSales).set(patch).where(eq(t.roomSales.id, row.id));
    await syncStayFromSale(user.id, after, row.roomId);
    if (auditChanges(row, after).length) {
      await audit(user.id, "room_sale", row.id, "update", row, after);
    }
  }
  const removedNumbers = removeIds
    .map((id) => {
      const sale = active.find((row) => row.id === id);
      const number = sale ? roomById.get(sale.roomId)?.number : "";
      return number ? `P.${number}` : "";
    })
    .filter(Boolean);
  for (const id of removeIds) await cancelRoomSale(user, id, false, { silent: true, skipMoneySync: true });
  await syncBookingMoney(key);
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await notifyBookingChange({
    actor: user,
    bookingId: key,
    createdBy: [...active].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdBy,
    title: `Sửa booking · ${guestName}`,
    body: `${user.fullName} · còn ${staying.length} phòng${removedNumbers.length ? ` · xóa ${removedNumbers.join(", ")}` : ""}`,
  });
  await dispatchBookingZalo(user.id, "booking_updated", key).catch((error) => console.error("zalo booking", error));
  await dispatchCheckinPaidZalo(user.id, key, wasPaidInhouse).catch((error) => console.error("zalo booking", error));
  await dispatchBookingWebhook({
    actor: user,
    bookingId: key,
    beforeRooms: prior ? bookingWebhookRooms(prior) : null,
  }).catch((error) => console.error("booking webhook", error));
  return key;
}
