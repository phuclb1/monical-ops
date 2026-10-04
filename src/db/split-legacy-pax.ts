import { and, eq } from "drizzle-orm";
import { nowISO } from "@/lib/datetime";
import { clampBreakfastPax, clampRoomAdults, roomAdultCap, splitBookingAdults, splitBookingChildren } from "@/lib/sales";
import type { AppDb } from "./index";
import * as t from "./schema";

const FLAG = "booking_pax_per_room_v1";

export type LegacyPaxSale = {
  id: string;
  bookingId: string | null;
  roomNumber: string;
  typeName: string;
  adults: number;
  children: number;
  breakfast: boolean;
  breakfastAdults: number | null;
  breakfastChildren: number | null;
};

export type PaxAssignment = {
  id: string;
  adults: number;
  children: number;
  breakfastAdults: number;
  breakfastChildren: number;
};

export function legacyPaxAssignments(rows: LegacyPaxSale[], capsByType: Map<string, number | null | undefined>): PaxAssignment[] {
  const groups = new Map<string, LegacyPaxSale[]>();
  for (const row of rows) {
    const key = row.bookingId || row.id;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const out: PaxAssignment[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, "vi") || a.id.localeCompare(b.id));
    const caps = sorted.map((row) => roomAdultCap(row.typeName, capsByType.get(row.typeName)));
    const copied = sorted.length > 1 && sorted.every((row) => row.adults === sorted[0].adults && row.children === sorted[0].children);
    const nextAdults = copied
      ? splitBookingAdults(sorted[0].adults, caps)
      : sorted.map((row, index) => clampRoomAdults(row.adults, caps[index]));
    const nextChildren = copied
      ? splitBookingChildren(sorted[0].children, sorted.length)
      : sorted.map((row) => Math.max(0, Math.round(row.children || 0)));
    const changed = sorted.some((row, index) => nextAdults[index] !== row.adults || nextChildren[index] !== row.children);
    if (!changed) continue;
    const stayAdults = nextAdults.reduce((sum, value) => sum + value, 0);
    const stayChildren = nextChildren.reduce((sum, value) => sum + value, 0);
    const eating = sorted.some((row) => row.breakfast);
    const sample = sorted.find((row) => row.breakfast) ?? sorted[0];
    const breakfast = clampBreakfastPax(stayAdults, stayChildren, sample?.breakfastAdults, sample?.breakfastChildren, eating);
    sorted.forEach((row, index) => {
      out.push({
        id: row.id,
        adults: nextAdults[index],
        children: nextChildren[index],
        breakfastAdults: breakfast.adults,
        breakfastChildren: breakfast.children,
      });
    });
  }
  return out;
}

async function loadPlan(db: AppDb) {
  const [sales, rooms, types] = await Promise.all([
    db.select().from(t.roomSales),
    db.select().from(t.rooms),
    db.select().from(t.roomTypes),
  ]);
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const caps = new Map(types.map((type) => [type.name, type.adults]));
  return legacyPaxAssignments(
    sales.map((sale) => ({
      id: sale.id,
      bookingId: sale.bookingId,
      roomNumber: roomById.get(sale.roomId)?.number || sale.roomId,
      typeName: roomById.get(sale.roomId)?.type || "",
      adults: sale.adults,
      children: sale.children,
      breakfast: sale.breakfast !== false,
      breakfastAdults: sale.breakfastAdults,
      breakfastChildren: sale.breakfastChildren,
    })),
    caps,
  );
}

async function applyPlan(db: AppDb, plan: PaxAssignment[]) {
  const now = nowISO();
  for (const row of plan) {
    const sale = (await db.select().from(t.roomSales).where(eq(t.roomSales.id, row.id)).limit(1))[0];
    if (!sale) continue;
    await db
      .update(t.roomSales)
      .set({
        adults: row.adults,
        children: row.children,
        breakfastAdults: row.breakfastAdults,
        breakfastChildren: row.breakfastChildren,
        updatedAt: now,
      })
      .where(eq(t.roomSales.id, row.id));
    if (!sale.pmsCode) continue;
    await db
      .update(t.stays)
      .set({ adults: row.adults, children: row.children, updatedAt: now })
      .where(and(eq(t.stays.pmsCode, sale.pmsCode), eq(t.stays.roomId, sale.roomId)));
  }
}

export async function splitLegacyBookingPax(db: AppDb) {
  const existing = (await db.select().from(t.appSettings).where(eq(t.appSettings.key, FLAG)).limit(1))[0];
  if (existing?.value === "done") return;
  let plan: PaxAssignment[];
  if (existing?.value.startsWith("{")) {
    plan = (JSON.parse(existing.value) as { plan?: PaxAssignment[] }).plan || [];
  } else {
    plan = await loadPlan(db);
    const payload = JSON.stringify({ plan });
    if (!existing) {
      try {
        await db.insert(t.appSettings).values({ key: FLAG, value: payload, updatedAt: nowISO(), updatedBy: null });
      } catch {
        return;
      }
    } else {
      await db.update(t.appSettings).set({ value: payload, updatedAt: nowISO() }).where(eq(t.appSettings.key, FLAG));
    }
  }
  await applyPlan(db, plan);
  await db.update(t.appSettings).set({ value: "done", updatedAt: nowISO() }).where(eq(t.appSettings.key, FLAG));
}
