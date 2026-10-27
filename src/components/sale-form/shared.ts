import { addDaysVN, datesUntil } from "@/lib/datetime";
import { rangesOverlap } from "@/lib/sales";
import type { DiscountKind } from "@/lib/types";

export type Room = { id: string; number: string; type: string; floor?: number; opsStatus?: string };
export type RoomType = { name: string; sortOrder: number; baseRate: number; weekendRate: number; adults?: number };
export type StayDates = { checkIn: string; checkOut: string };
export type DiscountState = { kind: DiscountKind; value: string };
export type RoomTypeAvailability = {
  type: string;
  total: number;
  available: number;
  nights: { date: string; available: number }[];
};
export type RoomAvailabilityRow = {
  roomId: string;
  number: string;
  type: string;
  nights: { date: string; available: boolean }[];
};

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

export function roomTypeAvailability(
  rooms: Room[],
  types: RoomType[],
  checkIn: string,
  checkOut: string,
  busy: { roomId: string; checkIn: string; checkOut: string }[],
): RoomTypeAvailability[] {
  const nights = datesUntil(checkIn, checkOut);
  if (!nights.length) return [];
  const sellable = rooms.filter((room) => room.opsStatus !== "ooo");
  return groupRoomsByType(sellable, types).map((group) => ({
    type: group.type,
    total: group.rooms.length,
    available: group.rooms.filter((room) => roomOpen(room.id, checkIn, checkOut, busy)).length,
    nights: nights.map((date) => ({
      date,
      available: group.rooms.filter((room) => roomOpen(room.id, date, addDaysVN(date, 1), busy)).length,
    })),
  }));
}

export function roomAvailabilityTable(
  rooms: Room[],
  types: RoomType[],
  checkIn: string,
  checkOut: string,
  busy: { roomId: string; checkIn: string; checkOut: string }[],
): RoomAvailabilityRow[] {
  const nights = datesUntil(checkIn, checkOut);
  if (!nights.length) return [];
  const sellable = rooms.filter((room) => room.opsStatus !== "ooo");
  return groupRoomsByType(sellable, types).flatMap((group) =>
    group.rooms.map((room) => ({
      roomId: room.id,
      number: room.number,
      type: room.type,
      nights: nights.map((date) => ({
        date,
        available: roomOpen(room.id, date, addDaysVN(date, 1), busy),
      })),
    })),
  );
}

export type NightPicks = Record<string, string[]>;
export type StaySegment = { roomId: string; checkIn: string; checkOut: string; nights: string[] };

function contiguousRuns(dates: string[]) {
  const sorted = [...new Set(dates)].filter(Boolean).sort();
  const runs: string[][] = [];
  for (const date of sorted) {
    const last = runs[runs.length - 1];
    if (last && addDaysVN(last[last.length - 1], 1) === date) last.push(date);
    else runs.push([date]);
  }
  return runs;
}

/** Collapse picked nights into one contiguous segment per room. A gap stays unbookable. */
export function segmentsFromPicks(picks: NightPicks) {
  const segments: StaySegment[] = [];
  const gappedRoomIds: string[] = [];
  for (const [roomId, dates] of Object.entries(picks)) {
    const runs = contiguousRuns(dates);
    if (!runs.length) continue;
    if (runs.length > 1) {
      gappedRoomIds.push(roomId);
      continue;
    }
    const nights = runs[0];
    segments.push({
      roomId,
      nights,
      checkIn: nights[0],
      checkOut: addDaysVN(nights[nights.length - 1], 1),
    });
  }
  segments.sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.roomId.localeCompare(b.roomId));
  return { segments, gappedRoomIds };
}

export function toggleNightPick(picks: NightPicks, roomId: string, date: string): NightPicks {
  const current = picks[roomId] || [];
  const nextDates = current.includes(date) ? current.filter((item) => item !== date) : [...current, date].sort();
  const next = { ...picks };
  if (nextDates.length) next[roomId] = nextDates;
  else delete next[roomId];
  return next;
}

export function toggleFreeStay(picks: NightPicks, roomId: string, nights: { date: string; available: boolean }[]): NightPicks {
  const free = nights.filter((night) => night.available).map((night) => night.date);
  const current = picks[roomId] || [];
  const allOn = free.length > 0 && current.length === free.length && free.every((date) => current.includes(date));
  const next = { ...picks };
  if (!free.length || allOn) delete next[roomId];
  else next[roomId] = [...free];
  return next;
}

export function clipNightPicks(picks: NightPicks, rows: RoomAvailabilityRow[]): NightPicks {
  if (!rows.length) return {};
  const open = new Map(rows.map((row) => [row.roomId, new Set(row.nights.filter((night) => night.available).map((night) => night.date))]));
  const next: NightPicks = {};
  for (const [roomId, dates] of Object.entries(picks)) {
    const nights = open.get(roomId);
    if (!nights) continue;
    const kept = [...new Set(dates)].filter((date) => nights.has(date)).sort();
    if (kept.length) next[roomId] = kept;
  }
  return next;
}

export function uncoveredNights(stayNights: string[], picks: NightPicks) {
  const covered = new Set(Object.values(picks).flat());
  return stayNights.filter((date) => !covered.has(date));
}

/** Busiest night. A split stay keeps one party; overlapping rooms add up. */
export function peakStayPax(segments: { nights: string[]; adults: number; children: number }[]) {
  const byNight = new Map<string, { adults: number; children: number }>();
  for (const segment of segments) {
    for (const date of segment.nights) {
      const row = byNight.get(date) || { adults: 0, children: 0 };
      row.adults += Math.max(0, segment.adults || 0);
      row.children += Math.max(0, segment.children || 0);
      byNight.set(date, row);
    }
  }
  let adults = 0;
  let children = 0;
  for (const row of byNight.values()) {
    adults = Math.max(adults, row.adults);
    children = Math.max(children, row.children);
  }
  return { adults, children };
}
