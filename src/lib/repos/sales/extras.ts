import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO } from "../../datetime";
import { can } from "../../permissions";
import { isActiveSaleStatus } from "../../sales";
import type { SessionUser } from "../../types";
import { audit } from "../audit";
import { getBooking } from "./queries";

export async function listSaleExtraTypes() {
  const db = await getDb();
  return (await db.select().from(t.saleExtraTypes)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function setSaleExtraTypeRates(user: SessionUser, rates: { id: string; unitPrice: number }[]) {
  if (!can(user.role, "manageRates")) throw new Error("Chỉ quản lý sửa giá dịch vụ");
  const db = await getDb();
  for (const row of rates) {
    const before = (await db.select().from(t.saleExtraTypes).where(eq(t.saleExtraTypes.id, row.id)).limit(1))[0];
    if (!before) continue;
    const unitPrice = Math.max(0, Math.round(row.unitPrice || 0));
    await db.update(t.saleExtraTypes).set({ unitPrice }).where(eq(t.saleExtraTypes.id, row.id));
    if (before.unitPrice !== unitPrice) {
      await audit(user.id, "sale_extra_type", row.id, "rate", before, { unitPrice });
    }
  }
}

export type SaleExtraDraft = { typeId?: string; name?: string; qty?: number; unitPrice?: number };

export async function resolveSaleExtras(rows: SaleExtraDraft[]) {
  const types = rows.length ? await listSaleExtraTypes() : [];
  return rows.map((data) => {
    const type = data.typeId ? types.find((row) => row.id === data.typeId && row.active) : undefined;
    const name = (type?.name || data.name || "").trim();
    if (!name) throw new Error("Nhập tên phụ thu");
    const qty = Math.max(1, Math.round(data.qty || 1));
    const unitPrice = Math.max(0, Math.round(type ? type.unitPrice : data.unitPrice || 0));
    if (!type && !unitPrice) throw new Error("Nhập số tiền phụ thu");
    return {
      typeId: type?.id || null,
      kind: type?.code || "other",
      name,
      qty,
      unitPrice,
      unit: type?.unit || "once",
    };
  });
}

export async function insertSaleExtras(user: SessionUser, bookingId: string, rows: Awaited<ReturnType<typeof resolveSaleExtras>>) {
  if (!rows.length) return;
  const db = await getDb();
  const createdAt = nowISO();
  for (const row of rows) {
    const record = { id: nid(), bookingId, ...row, createdAt, createdBy: user.id };
    await db.insert(t.saleExtras).values(record);
    await audit(user.id, "sale_extra", record.id, "create", undefined, record);
  }
}

export async function addBookingExtra(user: SessionUser, bookingId: string, data: SaleExtraDraft) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  if (!booking.rooms.some((row) => isActiveSaleStatus(row.status))) throw new Error("Booking đã đóng, không thêm dịch vụ");
  const [row] = await resolveSaleExtras([data]);
  await insertSaleExtras(user, booking.id, [row]);
  return booking.id;
}

export async function removeBookingExtra(user: SessionUser, extraId: string) {
  const db = await getDb();
  const before = (await db.select().from(t.saleExtras).where(eq(t.saleExtras.id, extraId)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy dịch vụ");
  const booking = await getBooking(before.bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  if (!booking.rooms.some((row) => isActiveSaleStatus(row.status))) throw new Error("Booking đã đóng");
  await db.delete(t.saleExtras).where(eq(t.saleExtras.id, extraId));
  await audit(user.id, "sale_extra", extraId, "delete", before, undefined);
  return booking.id;
}
