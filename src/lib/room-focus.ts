import { formatDate } from "./datetime";
import { isActiveSaleStatus } from "./sales";
import { HK_LABEL } from "./constants";
import type { HkStatus } from "./types";

export const ROOM_FOCUS_IDS = ["booking", "arriving", "inhouse", "departing", "dirty"] as const;
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

export function isDirtyRoom(room: { opsStatus: string; hkStatus: string }) {
  if (room.opsStatus === "ooo") return false;
  return (
    ["vacant_dirty", "cleaning", "waiting_inspect"].includes(room.opsStatus) ||
    ["waiting", "accepted", "cleaning", "waiting_inspect"].includes(room.hkStatus)
  );
}

export function roomFocusLabel(id: RoomFocus, date: string, today: string) {
  const day = date === today ? "hôm nay" : formatDate(date);
  if (id === "booking") return "Sẽ đến";
  if (id === "arriving") return `Check-in ${day}`;
  if (id === "inhouse") return "Đang ở";
  if (id === "departing") return `Trả ${day}`;
  return "Phòng bẩn";
}

function put(map: Map<string, RoomFocusHit>, hit: RoomFocusHit) {
  const prev = map.get(hit.roomId);
  if (!prev) {
    map.set(hit.roomId, hit);
    return;
  }
  if (hit.href.startsWith("/sales") && !prev.href.startsWith("/sales")) map.set(hit.roomId, hit);
}

export function buildRoomFocus(input: {
  date: string;
  rooms: { id: string; number: string; opsStatus: string; hkStatus: string }[];
  sales: { id: string; roomId: string; guestName: string; status: string; checkIn: string; checkOut: string }[];
  stays: { id: string; roomId: string | null; guestName: string; status: string; arrivalDate: string; departureDate: string }[];
  dirtyRoomIds: Set<string>;
}) {
  const booking = new Map<string, RoomFocusHit>();
  const arriving = new Map<string, RoomFocusHit>();
  const inhouse = new Map<string, RoomFocusHit>();
  const departing = new Map<string, RoomFocusHit>();
  const dirty = new Map<string, RoomFocusHit>();
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

  for (const stay of input.stays) {
    if (!stay.roomId) continue;
    const href = `/reception/${stay.id}`;
    const guestName = stay.guestName;
    if (stay.status === "arriving" && stay.arrivalDate > date) {
      put(booking, { roomId: stay.roomId, guestName, href, hint: `Đến ${formatDate(stay.arrivalDate)}` });
    }
    if (stay.status === "arriving" && stay.arrivalDate <= date) {
      put(arriving, { roomId: stay.roomId, guestName, href, hint: "Chưa nhận phòng" });
    }
    if (stay.status === "inhouse" && stay.departureDate > date) {
      put(inhouse, { roomId: stay.roomId, guestName, href, hint: `Ở đến ${formatDate(stay.departureDate)}` });
    }
    if (stay.status === "departing" || ((stay.status === "inhouse" || stay.status === "arriving") && stay.departureDate === date)) {
      put(departing, { roomId: stay.roomId, guestName, href, hint: "Trả phòng" });
    }
  }

  const rooms = new Map(input.rooms.map((room) => [room.id, room]));
  for (const roomId of input.dirtyRoomIds) {
    const room = rooms.get(roomId);
    if (!room) continue;
    const guest =
      departing.get(roomId) || inhouse.get(roomId) || arriving.get(roomId) || booking.get(roomId);
    dirty.set(roomId, {
      roomId,
      guestName: guest?.guestName || "",
      href: guest?.href || `/rooms/${roomId}`,
      hint: guest?.guestName
        ? `Yêu cầu dọn · P.${room.number}`
        : HK_LABEL[room.hkStatus as HkStatus] || "Cần dọn",
    });
  }

  const lists = {
    booking: [...booking.values()],
    arriving: [...arriving.values()],
    inhouse: [...inhouse.values()],
    departing: [...departing.values()],
    dirty: [...dirty.values()],
  };
  return {
    ...lists,
    counts: {
      booking: lists.booking.length,
      arriving: lists.arriving.length,
      inhouse: lists.inhouse.length,
      departing: lists.departing.length,
      dirty: lists.dirty.length,
    },
  };
}
