import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../../datetime";
import { ensureTodayRoomTasks } from "../../checklist-ops";
import { auditChanges } from "../../audit-view";
import {
  bookingKey,
  catalogRate,
  clampBreakfastPax,
  isActiveSaleStatus,
  isOtaDebt,
  isSaleSource,
  normalizeDiscount,
  roomMoveKind,
} from "../../sales";
import type { SessionUser } from "../../types";
import { audit } from "../audit";
import { assertSaleWindow, paymentOf } from "./helpers";
import { notifyBookingChange } from "./notify";
import { syncStayFromSale } from "./stay";

export async function updateBooking(
  user: SessionUser,
  bookingId: string,
  data: {
    assignments: { saleId: string; roomId: string; checkIn?: string; checkOut?: string; breakfast?: boolean; discountKind?: string; discountValue?: number }[];
    guestName?: string;
    guestPhone?: string;
    source?: string;
    otaPaymentMode?: "debt" | "hotel";
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
    cashPaid?: number;
    transferPaid?: number;
    companyPaid?: number;
    paymentMethod?: string;
    notes?: string;
  },
) {
  const db = await getDb();
  const [all, rooms, types] = await Promise.all([
    db.select().from(t.roomSales),
    db.select().from(t.rooms),
    db.select().from(t.roomTypes),
  ]);
  const hit = all.find((row) => row.id === bookingId || row.bookingId === bookingId);
  if (!hit) throw new Error("Không tìm thấy booking");
  const key = bookingKey(hit);
  const active = all.filter((row) => bookingKey(row) === key && isActiveSaleStatus(row.status));
  if (!active.length) throw new Error("Booking đã đóng, không sửa");
  const guestName = data.guestName !== undefined ? data.guestName.trim() : hit.guestName;
  if (!guestName) throw new Error("Nhập tên khách");
  if (data.source !== undefined && data.source !== "" && !isSaleSource(data.source)) throw new Error("Chọn nền tảng booking");
  const source = data.source && isSaleSource(data.source) ? data.source : hit.source;
  const otaPaymentMode =
    data.otaPaymentMode === undefined
      ? hit.otaPaymentMode === "hotel" ? "hotel" : "debt"
      : data.otaPaymentMode === "hotel" ? "hotel" : "debt";
  const guestPhone = data.guestPhone !== undefined ? data.guestPhone.trim() || null : hit.guestPhone;
  const adults = Math.max(1, data.adults ?? hit.adults ?? 1);
  const children = Math.max(0, data.children ?? hit.children ?? 0);
  const cars = Math.max(0, data.cars ?? hit.cars ?? 0);
  const bikes = Math.max(0, data.bikes ?? hit.bikes ?? 0);
  const paid = isOtaDebt(source, otaPaymentMode) && !isOtaDebt(hit.source, hit.otaPaymentMode)
    ? { cashPaid: 0, transferPaid: 0, companyPaid: 0, deposit: 0 }
    : paymentOf(
    {
      guestName,
      source,
      checkIn: hit.checkIn,
      checkOut: hit.checkOut,
      rate: hit.rate,
      deposit: data.deposit,
      cashPaid: data.cashPaid,
      transferPaid: data.transferPaid,
      companyPaid: data.companyPaid,
      paymentMethod: data.paymentMethod,
    },
    hit,
  );
  const notes = data.notes !== undefined ? data.notes.trim() || null : undefined;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const nextBySale = new Map(data.assignments.map((row) => [row.saleId, row]));
  const hasBreakfast = active.some((row) => {
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
  for (const row of active) {
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
    if (!kind) throw new Error(`P.${next.number} không cùng hạng và không phải nâng hạng so với ${current?.type || "phòng hiện tại"}`);
    const nextRate =
      kind === "upgrade"
        ? catalogRate(types.find((type) => type.name === next.type), nextIn) || row.rate
        : row.rate;
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
      invoiceRequested: data.invoiceRequested ?? hit.invoiceRequested,
      adults,
      children,
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
      deposit: paid.deposit,
      cashPaid: paid.cashPaid,
      transferPaid: paid.transferPaid,
      companyPaid: paid.companyPaid,
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
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await notifyBookingChange({
    actor: user,
    bookingId: key,
    createdBy: [...active].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdBy,
    title: `Sửa booking · ${guestName}`,
    body: `${user.fullName} · ${active.length} phòng`,
  });
  return key;
}
