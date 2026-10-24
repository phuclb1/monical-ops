import { formatDate } from "./datetime";
import { isActiveSaleStatus } from "./sales";

export const ROOM_FOCUS_IDS = ["booking", "arriving", "inhouse", "departing"] as const;
export type RoomFocus = (typeof ROOM_FOCUS_IDS)[number];

export type RoomFocusHit = {
  roomId: string;
  guestName: string;
  href: string;
  hint: string;
};

export function isRoomFocus(value: string): value is RoomFocus {
  return (ROOM_FOCUS_IDS as readonly string[]).includes(value);
}

export function roomFocusLabel(id: RoomFocus, date: string, today: string) {
  const day = date === today ? "hôm nay" : formatDate(date);
  if (id === "booking") return "Sẽ đến";
  if (id === "arriving") return `Check-in ${day}`;
  if (id === "inhouse") return "Đang ở";
  return `Trả ${day}`;
}

function put(map: Map<string, RoomFocusHit>, hit: RoomFocusHit) {
  if (!map.has(hit.roomId)) map.set(hit.roomId, hit);
}

export function buildRoomFocus(input: {
  date: string;
  sales: { id: string; roomId: string; guestName: string; status: string; checkIn: string; checkOut: string }[];
}) {
  const booking = new Map<string, RoomFocusHit>();
  const arriving = new Map<string, RoomFocusHit>();
  const inhouse = new Map<string, RoomFocusHit>();
  const departing = new Map<string, RoomFocusHit>();
  const { date } = input;

  for (const sale of input.sales) {
    if (!isActiveSaleStatus(sale.status)) continue;
    const href = `/sales/${sale.id}`;
    const guestName = sale.guestName;
    if (sale.status === "reserved" && sale.checkIn > date) {
      put(booking, { roomId: sale.roomId, guestName, href, hint: `Booking ${formatDate(sale.checkIn)}` });
    }
    if (sale.status === "reserved" && sale.checkIn <= date && sale.checkOut > date) {
      put(arriving, { roomId: sale.roomId, guestName, href, hint: sale.checkIn === date ? "Chưa nhận phòng" : `Booking ${formatDate(sale.checkIn)}` });
    }
    if (sale.status === "inhouse" && sale.checkOut > date) {
      put(inhouse, { roomId: sale.roomId, guestName, href, hint: `Ở đến ${formatDate(sale.checkOut)}` });
    }
    if (sale.checkOut === date) {
      put(departing, { roomId: sale.roomId, guestName, href, hint: "Trả phòng" });
    }
  }

  const lists = {
    booking: [...booking.values()],
    arriving: [...arriving.values()],
    inhouse: [...inhouse.values()],
    departing: [...departing.values()],
  };
  return {
    ...lists,
    counts: {
      booking: lists.booking.length,
      arriving: lists.arriving.length,
      inhouse: lists.inhouse.length,
      departing: lists.departing.length,
    },
  };
}
