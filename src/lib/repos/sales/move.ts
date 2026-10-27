import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../../datetime";
import { bookingKey, catalogRate, isActiveSaleStatus, isOtaSource, rateForRoomMove, roomMoveKind } from "../../sales";
import type { SessionUser } from "../../types";
import { audit } from "../audit";
import { assertSaleWindow } from "./helpers";
import { dispatchBookingWebhook } from "@/lib/booking-webhook";
import { notifyBookingChange } from "./notify";
import { syncBookingMoney } from "./money-sync";

export async function moveGanttSale(
  user: SessionUser,
  data: { saleId: string; roomId: string; checkIn: string; checkOut: string },
) {
  const db = await getDb();
  const [before, types] = await Promise.all([
    db.select().from(t.roomSales).where(eq(t.roomSales.id, data.saleId)).limit(1).then((rows) => rows[0]),
    db.select().from(t.roomTypes),
  ]);
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng, không kéo trên sơ đồ");
  const current = (await db.select().from(t.rooms).where(eq(t.rooms.id, before.roomId)).limit(1))[0];
  if (!current) throw new Error("Không tìm thấy phòng hiện tại");
  const today = todayVN();
  const checkIn = data.checkIn;
  const checkOut = data.checkOut;
  if (before.status === "inhouse" && checkIn !== before.checkIn) {
    throw new Error("Khách đang ở — không đổi ngày nhận. Kéo sang phòng trống cùng ngày.");
  }
  if (before.status === "inhouse" && checkOut < today) throw new Error("Ngày trả không được trước hôm nay");
  const next = await assertSaleWindow(data.roomId, checkIn, checkOut, before.id);
  const kind = roomMoveKind(current.type, next.type, types);
  if (!kind) throw new Error(`P.${next.number} không thuộc hạng phòng đã khai báo`);
  const nextRate = rateForRoomMove(
    kind,
    catalogRate(types.find((type) => type.name === next.type), checkIn),
    before.rate,
    isOtaSource(before.source),
  );
  const now = nowISO();
  const patch = {
    roomId: next.id,
    rate: nextRate,
    checkIn,
    checkOut,
    updatedAt: now,
    updatedBy: user.id,
  };
  await db.update(t.roomSales).set(patch).where(eq(t.roomSales.id, before.id));
  await syncBookingMoney(bookingKey(before));
  await audit(user.id, "room_sale", before.id, "update", before, patch);
  const bookingId = bookingKey(before);
  await notifyBookingChange({
    actor: user,
    bookingId,
    title: `Sửa booking · ${before.guestName}`,
    body: `${user.fullName} · ${checkIn} → ${checkOut}`,
  });
  await dispatchBookingWebhook({
    actor: user,
    bookingId,
    beforeRooms: [
      {
        saleId: before.id,
        roomId: before.roomId,
        roomNumber: current.number,
        checkIn: before.checkIn,
        checkOut: before.checkOut,
      },
    ],
  }).catch((error) => console.error("booking webhook", error));
  return bookingId;
}
