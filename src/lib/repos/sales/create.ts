import { eq, or } from "drizzle-orm";
import { nextOpsBookingCode } from "@/db/ops-codes";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO, todayVN } from "../../datetime";
import { ensureTodayRoomTasks } from "../../checklist-ops";
import { bookingQuote, catalogRate, isActiveSaleStatus, isOtaSource, isSaleSource } from "../../sales";
import type { SaleStatus, SessionUser } from "../../types";
import { audit } from "../audit";
import { listRooms, listRoomTypes } from "../rooms";
import { assertSaleWindow, paymentOf, saleLineWindow, salePax, type SaleInput, uniqueSaleRoomIds } from "./helpers";
import { notifyBookingChange } from "./notify";
import { extraAmount } from "../../extras";
import { insertSaleExtras, resolveSaleExtras } from "./extras";
import { applySaleRoomState, syncStayFromSale } from "./stay";

export async function createRoomSale(user: SessionUser, data: SaleInput) {
  const guestName = data.guestName.trim();
  if (!guestName) throw new Error("Nhập tên khách");
  if (!isSaleSource(data.source)) throw new Error("Chọn nền tảng booking");
  const origin = data.origin === "ezcloud" ? "ezcloud" : "ops";
  if (origin === "ezcloud" && !data.pmsCode?.trim()) throw new Error("Tích ezCloud thì nhập mã PMS");
  const roomIds = uniqueSaleRoomIds(data);
  const pax = salePax(data, roomIds);
  const lines = roomIds.map((roomId) => ({ roomId, ...saleLineWindow(data, roomId) }));
  const rooms = [];
  for (const line of lines) {
    rooms.push({ room: await assertSaleWindow(line.roomId, line.checkIn, line.checkOut), ...line });
  }
  const today = todayVN();
  const requestedBookingId = data.bookingId?.trim() || "";
  const bookingId = requestedBookingId || nid();
  const now = nowISO();
  const db = await getDb();
  const existing = requestedBookingId
    ? (
        await db
          .select({ createdBy: t.roomSales.createdBy })
          .from(t.roomSales)
          .where(or(eq(t.roomSales.id, requestedBookingId), eq(t.roomSales.bookingId, requestedBookingId)))
          .limit(1)
      )[0]
    : undefined;
  const createdBy = existing?.createdBy || user.id;
  const pmsCode =
    data.pmsCode?.trim() || (origin === "ops" ? await nextOpsBookingCode(db, now) : "");
  if (!pmsCode) throw new Error("Tích ezCloud thì nhập mã PMS");
  const paid =
    !requestedBookingId && isOtaSource(data.source)
      ? { cashPaid: 0, transferPaid: 0, companyPaid: 0, deposit: 0 }
      : paymentOf(data);
  const quote = bookingQuote(
    rooms.map((row) => ({
      rate: row.rate,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      breakfast: row.breakfast,
      discountKind: row.discountKind,
      discountValue: row.discountValue,
    })),
  );
  const preparedExtras = requestedBookingId ? [] : await resolveSaleExtras(data.extras || []);
  const bookingTotal = quote.total + preparedExtras.reduce((sum, row) => sum + extraAmount(row, quote.nights), 0);
  const ids: string[] = [];
  for (const row of rooms) {
    const id = nid();
    const status: SaleStatus = Boolean(data.checkinNow) && row.checkIn <= today ? "inhouse" : "reserved";
    const record = {
      id,
      bookingId,
      roomId: row.room.id,
      guestName,
      guestPhone: data.guestPhone?.trim() || null,
      origin,
      source: data.source,
      status,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      adults: pax.adults,
      children: pax.children,
      breakfastAdults: pax.breakfastAdults,
      breakfastChildren: pax.breakfastChildren,
      cars: Math.max(0, data.cars || 0),
      bikes: Math.max(0, data.bikes || 0),
      rate: row.rate,
      discountKind: row.discountKind,
      discountValue: row.discountValue,
      deposit: paid.deposit,
      cashPaid: paid.cashPaid,
      transferPaid: paid.transferPaid,
      companyPaid: paid.companyPaid,
      breakfast: row.breakfast,
      pmsCode,
      notes: data.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      updatedBy: user.id,
    };
    await db.insert(t.roomSales).values(record);
    await syncStayFromSale(user.id, record);
    if (status === "inhouse") await applySaleRoomState(user.id, record);
    await audit(user.id, "room_sale", id, "create", null, record);
    ids.push(id);
  }
  await insertSaleExtras(user, bookingId, preparedExtras);
  await ensureTodayRoomTasks(db, { actorId: user.id });
  const roomLabel = rooms.length === 1 ? `P.${rooms[0].room.number}` : `${rooms.length} phòng`;
  const spanIn = rooms.reduce((min, row) => (row.checkIn < min ? row.checkIn : min), rooms[0].checkIn);
  const spanOut = rooms.reduce((max, row) => (row.checkOut > max ? row.checkOut : max), rooms[0].checkOut);
  await notifyBookingChange({
    actor: user,
    bookingId,
    createdBy,
    title: `${existing ? "Thêm phòng" : "Đặt phòng"} · ${guestName}`,
    body: `${user.fullName} · ${roomLabel} · ${spanIn} → ${spanOut} · ${bookingTotal.toLocaleString("vi-VN")}₫`,
  });
  return { id: ids[0], bookingId };
}

export async function addRoomsToBooking(user: SessionUser, saleId: string, roomIds: string[]) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, saleId)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng, không thêm phòng");
  const ids = uniqueSaleRoomIds({ roomIds, guestName: before.guestName, rate: before.rate, source: before.source, checkIn: before.checkIn, checkOut: before.checkOut });
  const members = before.bookingId
    ? await db.select().from(t.roomSales).where(eq(t.roomSales.bookingId, before.bookingId))
    : [before];
  const taken = new Set(members.filter((row) => isActiveSaleStatus(row.status)).map((row) => row.roomId));
  if (ids.some((roomId) => taken.has(roomId))) throw new Error("Phòng đã thuộc booking này");
  const bookingId = before.bookingId || before.id;
  if (!before.bookingId) {
    await db.update(t.roomSales).set({ bookingId, updatedAt: nowISO(), updatedBy: user.id }).where(eq(t.roomSales.id, saleId));
  }
  const [types, rooms] = await Promise.all([listRoomTypes(), listRooms()]);
  const typeByName = Object.fromEntries(types.map((type) => [type.name, type]));
  const rates: Record<string, number> = {};
  for (const id of ids) {
    const room = rooms.find((row) => row.id === id);
    rates[id] = catalogRate(typeByName[room?.type || ""], before.checkIn);
  }
  return createRoomSale(user, {
    roomIds: ids,
    bookingId,
    guestName: before.guestName,
    guestPhone: before.guestPhone || "",
    source: before.source,
    checkIn: before.checkIn,
    checkOut: before.checkOut,
    adults: before.adults,
    children: before.children,
    breakfastAdults: before.breakfastAdults ?? undefined,
    breakfastChildren: before.breakfastChildren ?? undefined,
    cars: before.cars,
    bikes: before.bikes,
    rate: before.rate,
    rates,
    breakfasts: Object.fromEntries(ids.map((id) => [id, before.breakfast !== false])),
    discounts: Object.fromEntries(ids.map((id) => [id, { kind: "none", value: 0 }])),
    deposit: before.deposit,
    cashPaid: before.cashPaid,
    transferPaid: before.transferPaid,
    companyPaid: before.companyPaid,
    pmsCode: before.pmsCode || "",
    notes: before.notes || "",
    origin: before.origin,
  });
}
