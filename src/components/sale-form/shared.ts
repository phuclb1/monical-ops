import { rangesOverlap } from "@/lib/sales";
import type { DiscountKind } from "@/lib/types";

export type Room = { id: string; number: string; type: string; floor?: number; opsStatus?: string };
export type RoomType = { name: string; sortOrder: number; baseRate: number; weekendRate: number; adults?: number };
export type StayDates = { checkIn: string; checkOut: string };
export type DiscountState = { kind: DiscountKind; value: string };

export function emptyDiscount(): DiscountState {
  return { kind: "none", value: "" };
}

export function parseDiscountState(kind?: string | null, value?: number | null): DiscountState {
  if (kind === "percent" && (value || 0) > 100) return { kind: "amount", value: value ? String(value) : "" };
  if (kind === "percent" || kind === "amount") return { kind, value: value ? String(value) : "" };
  return emptyDiscount();
}

export function groupRoomsByType(rooms: Room[], types: RoomType[]) {
  const order = new Map(types.map((type, index) => [type.name, type.sortOrder || index]));
  const groups = new Map<string, Room[]>();
  for (const room of rooms) {
    const list = groups.get(room.type) || [];
    list.push(room);
    groups.set(room.type, list);
  }
  return [...groups.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
    .map(([type, items]) => ({ type, rooms: items.sort((a, b) => a.number.localeCompare(b.number)) }));
}

export function roomOpen(
  roomId: string,
  checkIn: string,
  checkOut: string,
  busy: { roomId: string; checkIn: string; checkOut: string }[],
) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return false;
  return !busy.some((row) => row.roomId === roomId && rangesOverlap(checkIn, checkOut, row.checkIn, row.checkOut));
}
