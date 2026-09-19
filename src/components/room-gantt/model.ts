import { bookingQuote, parkingLabel } from "@/lib/sales";

export const BAR: Record<string, string> = {
  reserved: "bg-[#fff1d2] text-[#8a6a22] ring-1 ring-[#e8c9a0]",
  inhouse: "bg-[#dceeee] text-[#0f4c4c] ring-1 ring-[#c9e6e4]",
  departed: "bg-[#e6e6e6] text-[#5c5c5c] ring-1 ring-[#cfcfcf]",
};

export function ganttBarTone(status: string) {
  if (status === "inhouse" || status === "departed") return status;
  return "reserved";
}

export const DRAG_PX = 8;

export type GanttSale = {
  id: string;
  bookingId?: string | null;
  roomId: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  rate: number;
  breakfast?: boolean | null;
  discountKind?: string | null;
  discountValue?: number | null;
  cars?: number | null;
  bikes?: number | null;
};

export function saleTitle(sale: GanttSale) {
  const parking = parkingLabel(sale.cars, sale.bikes);
  const action = sale.status === "departed" ? "đã trả phòng" : "kéo để đổi phòng / ngày";
  return `${sale.guestName} · ${sale.checkIn} → ${sale.checkOut}${parking !== "—" ? ` · ${parking}` : ""} — ${action}`;
}

export type GanttRow = {
  room: { id: string; number: string; type: string; floor: number; opsStatus: string };
  bars: { sale: GanttSale; start: number; end: number; nightStart: number; nightEnd: number }[];
};

export type RoomType = { name: string; sortOrder: number; baseRate: number; weekendRate: number };
export type GanttGroup = "floor" | "type";

export function ganttSections(rows: GanttRow[], types: RoomType[], group: GanttGroup) {
  if (group === "type") {
    const order = new Map(types.map((type, index) => [type.name, type.sortOrder || index]));
    const buckets = new Map<string, GanttRow[]>();
    for (const row of rows) {
      const key = row.room.type || "—";
      const list = buckets.get(key) || [];
      list.push(row);
      buckets.set(key, list);
    }
    return [...buckets.entries()]
      .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999) || a[0].localeCompare(b[0]))
      .map(([label, items]) => ({
        key: label,
        label,
        rows: items.slice().sort((a, b) => a.room.number.localeCompare(b.room.number)),
      }));
  }
  const floors = [...new Set(rows.map((row) => row.room.floor))].sort((a, b) => a - b);
  return floors.map((floor) => ({
    key: `floor-${floor}`,
    label: `Tầng ${floor}`,
    rows: rows.filter((row) => row.room.floor === floor),
  }));
}

export type Hover = { roomId: string; start: number };

export type DragState = {
  sale: GanttSale;
  fromRoomId: string;
  fromStart: number;
  nights: number;
  grab: number;
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  hover: Hover | null;
};

export type ConfirmState = {
  sale: GanttSale;
  room: GanttRow["room"];
  checkIn: string;
  checkOut: string;
  extra: number;
};

export function quoteTotal(sale: GanttSale, rate: number, checkIn: string, checkOut: string) {
  return bookingQuote([
    {
      rate,
      checkIn,
      checkOut,
      breakfast: sale.breakfast,
      discountKind: sale.discountKind,
      discountValue: sale.discountValue,
    },
  ]).total;
}

export function rangeOpen(row: GanttRow, start: number, nights: number, exceptId: string, dayCount: number) {
  if (row.room.opsStatus === "ooo") return false;
  if (nights < 1) return false;
  const end = start + nights;
  for (const bar of row.bars) {
    if (bar.sale.id === exceptId) continue;
    const a = Math.max(0, bar.nightStart);
    const b = Math.min(dayCount, bar.nightEnd);
    if (start < b && end > a) return false;
  }
  return true;
}
