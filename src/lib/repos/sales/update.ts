import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../../datetime";
import { ensureTodayRoomTasks } from "../../checklist-ops";
import { isActiveSaleStatus, normalizeDiscount } from "../../sales";
import type { SessionUser } from "../../types";
import { audit } from "../audit";
import { assertSaleWindow, paymentOf, type SaleInput, uniqueSaleRoomIds } from "./helpers";
import { bookingCreatedBy, notifyBookingChange } from "./notify";
import { syncStayFromSale } from "./stay";

export async function updateRoomSale(user: SessionUser, id: string, data: SaleInput) {
  const db = await getDb();
  const before = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng, không sửa");
  const guestName = before.guestName;
  const roomId = uniqueSaleRoomIds(data)[0];
  const peers = before.bookingId
    ? (await db.select().from(t.roomSales).where(eq(t.roomSales.bookingId, before.bookingId))).filter(
        (row) => row.id !== id && isActiveSaleStatus(row.status),
      )
    : [];
  await assertSaleWindow(roomId, data.checkIn, data.checkOut, id);
  const { discountKind, discountValue } = normalizeDiscount(data.discountKind, data.discountValue);
  const rate = Math.max(0, data.rates?.[roomId] ?? data.rate);
  const breakfast = data.breakfasts?.[roomId] ?? before.breakfast !== false;
  const paid = paymentOf(data, before);
  const patch = {
    roomId,
    guestName,
    guestPhone: before.guestPhone,
    origin: before.origin,
    source: before.source,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    adults: before.adults,
    children: before.children,
    rate,
    discountKind,
    discountValue,
    deposit: paid.deposit,
    cashPaid: paid.cashPaid,
    transferPaid: paid.transferPaid,
    companyPaid: paid.companyPaid,
    breakfast,
    pmsCode: before.pmsCode,
    notes: before.notes,
    updatedAt: nowISO(),
    updatedBy: user.id,
  };
  await db.update(t.roomSales).set(patch).where(eq(t.roomSales.id, id));
  await syncStayFromSale(user.id, { ...before, ...patch }, before.roomId);
  const shared = {
    guestName: patch.guestName,
    guestPhone: patch.guestPhone,
    origin: patch.origin,
    source: patch.source,
    deposit: patch.deposit,
    cashPaid: patch.cashPaid,
    transferPaid: patch.transferPaid,
    companyPaid: patch.companyPaid,
    pmsCode: patch.pmsCode,
    notes: patch.notes,
    updatedAt: patch.updatedAt,
    updatedBy: patch.updatedBy,
  };
  for (const peer of peers) {
    await db.update(t.roomSales).set(shared).where(eq(t.roomSales.id, peer.id));
    await syncStayFromSale(user.id, { ...peer, ...shared });
  }
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", id, "update", before, patch);
  const bookingId = before.bookingId || before.id;
  await notifyBookingChange({
    actor: user,
    bookingId,
    createdBy: await bookingCreatedBy(bookingId, before.createdBy),
    title: `Sửa booking · ${guestName}`,
    body: `${user.fullName} · ${before.checkIn} → ${data.checkOut}`,
  });
}
