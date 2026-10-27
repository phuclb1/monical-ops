import { addDaysVN, addMonthsVN, startOfMonthVN } from "@/lib/datetime";

export const BOOKING_LIST_VIEWS = ["new", "month", "checkin", "stay", "checkout", "tomorrow"] as const;
export type BookingListView = (typeof BOOKING_LIST_VIEWS)[number];

const ACTIVE = new Set(["reserved", "inhouse"]);

type StaySpan = {
  checkIn: string;
  checkOut: string;
  status: string;
};

function activeRooms(row: StaySpan & { rooms?: StaySpan[] }) {
  const rooms = row.rooms?.length ? row.rooms : [row];
  return rooms.filter((room) => ACTIVE.has(room.status));
}

export function isBookingListView(value: string): value is BookingListView {
  return (BOOKING_LIST_VIEWS as readonly string[]).includes(value);
}

export function bookingMatchesListView(row: StaySpan & { rooms?: StaySpan[] }, view: BookingListView, today: string) {
  if (view === "new") return true;
  const rooms = activeRooms(row);
  if (!rooms.length) return false;
  if (view === "month") {
    const from = startOfMonthVN(today);
    const to = addMonthsVN(from, 1);
    return rooms.some((room) => room.checkIn >= from && room.checkIn < to);
  }
  if (view === "checkin") return rooms.some((room) => room.checkIn === today);
  if (view === "stay") return rooms.some((room) => room.checkIn <= today && room.checkOut > today);
  if (view === "checkout") return rooms.some((room) => room.checkOut === today);
  return rooms.some((room) => room.checkIn === addDaysVN(today, 1));
}
