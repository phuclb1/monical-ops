import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nowISO, todayVN } from "../../datetime";
import { ensureTodayRoomTasks } from "../../checklist-ops";
import { bookingKey, catalogRate, isActiveSaleStatus, roomMoveKind } from "../../sales";
import type { SessionUser } from "../../types";
import { audit } from "../audit";
import { assertSaleWindow } from "./helpers";
import { bookingCreatedBy, notifyBookingChange } from "./notify";
import { syncStayFromSale } from "./stay";

export async function moveGanttSale(
  user: SessionUser,
  data: { saleId: string; roomId: string; checkIn: string; checkOut: string },
) {
  const db = await getDb();
  const [all, rooms, types] = await Promise.all([
    db.select().from(t.roomSales),
    db.select().from(t.rooms),
    db.select().from(t.roomTypes),
  ]);
  const before = all.find((row) => row.id === data.saleId);
  if (!before) throw new Error("Không tìm thấy chỗ bán");
  if (!isActiveSaleStatus(before.status)) throw new Error("Chỗ đã đóng, không kéo trên sơ đồ");
  const current = rooms.find((room) => room.id === before.roomId);
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
  if (!kind) {
    throw new Error(`P.${next.number} không cùng hạng và không phải nâng hạng so với ${current.type}`);
  }
  const nextRate =
    kind === "upgrade" ? catalogRate(types.find((type) => type.name === next.type), checkIn) || before.rate : before.rate;
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
  await syncStayFromSale(user.id, { ...before, ...patch }, before.roomId);
  await ensureTodayRoomTasks(db, { actorId: user.id });
  await audit(user.id, "room_sale", before.id, "update", before, patch);
  const bookingId = bookingKey(before);
  await notifyBookingChange({
    actor: user,
    bookingId,
    createdBy: await bookingCreatedBy(bookingId, before.createdBy),
    title: `Sửa booking · ${before.guestName}`,
    body: `${user.fullName} · ${checkIn} → ${checkOut}`,
  });
  return bookingId;
}
