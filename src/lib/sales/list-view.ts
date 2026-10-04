export const BOOKING_LIST_VIEWS = ["new", "checkin", "checkout"] as const;
export type BookingListView = (typeof BOOKING_LIST_VIEWS)[number];

const DAY_STATUSES = new Set(["reserved", "inhouse", "departed"]);

type StaySpan = {
  checkIn: string;
  checkOut: string;
  status: string;
};

export function isBookingListView(value: string): value is BookingListView {
  return (BOOKING_LIST_VIEWS as readonly string[]).includes(value);
}

export function bookingMatchesListView(row: StaySpan & { rooms?: StaySpan[] }, view: BookingListView, today: string) {
  if (view === "new") return true;
  const field = view === "checkin" ? "checkIn" : "checkOut";
  const rooms = row.rooms?.length ? row.rooms : [row];
  return rooms.some((room) => room[field] === today && DAY_STATUSES.has(room.status));
}
