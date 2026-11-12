import { SALE_SOURCE_LABEL } from "@/lib/constants";
import { addDaysVN, addMonthsVN, startOfMonthVN } from "@/lib/datetime";
import { roomRevenueReport } from "@/lib/sales-report";
import type { SaleSource } from "@/lib/types";

const ARRIVAL_STATUSES = new Set(["reserved", "inhouse", "departed", "no_show"]);
const DEPARTURE_STATUSES = new Set(["reserved", "inhouse", "departed"]);

export type DeskGuest = {
  id: string;
  name: string;
  room: string;
  phone: string;
  code: string;
  source: string;
  status: string;
  mark: string;
  checkIn: string;
  checkOut: string;
  total: number;
  due: number;
  flag: "" | "late" | "due-out";
};

export type DeskMoney = {
  label: string;
  count: number;
  total: number;
  direct: number;
  ota: number;
  hotelNet: number;
  due: number;
  recognized: number;
};

export type DeskBrief = {
  today: string;
  date: string;
  arrivals: DeskGuest[];
  departures: DeskGuest[];
  inhouse: DeskGuest[];
  due: DeskGuest[];
  found: DeskGuest[];
  vacantRooms: string[];
  occupancy: { rooms: number; vacant: number; reserved: number; inhouse: number; ooo: number };
  revenue: { month: DeskMoney; day: DeskMoney };
};

type DeskRoom = { status?: string; number?: string | null };

export type DeskBooking = {
  id: string;
  guestName: string;
  guestPhone?: string | null;
  pmsCode?: string | null;
  source?: string | null;
  status: string;
  checkIn: string;
  checkOut: string;
  total: number;
  due: number;
  deposit?: number;
  roomLabel?: string;
  rooms?: { status?: string; room?: { number?: string | null } | null }[];
  otaPaymentMode?: string | null;
  otaCommissionPercent?: number | null;
  otaCommissionKind?: string | null;
  otaCommissionValue?: number | null;
  roomTotal?: number | null;
  extrasTotal?: number | null;
  cashPaid?: number | null;
  transferPaid?: number | null;
  companyPaid?: number | null;
};

const MARK: Record<string, string> = {
  reserved: "chưa in",
  inhouse: "đã in",
  departed: "đã trả",
  no_show: "no-show",
  cancelled: "huỷ",
};

function sourceLabel(source: string) {
  if (source in SALE_SOURCE_LABEL) return SALE_SOURCE_LABEL[source as SaleSource];
  return source;
}

function roomNumbers(row: DeskBooking, onlyInhouse = false) {
  const rooms: DeskRoom[] = (row.rooms || []).map((room) => ({
    status: room.status,
    number: room.room?.number || "",
  }));
  const picked = (onlyInhouse ? rooms.filter((room) => room.status === "inhouse") : rooms).map((room) => room.number || "").filter(Boolean);
  if (picked.length) return picked.join(", ");
  return (row.roomLabel || "").replace(/P\./g, "").replace(/\s·\s/g, ", ").trim();
}

function guestOf(row: DeskBooking, today: string, onlyInhouse = false): DeskGuest {
  const due = Math.max(0, Math.round(row.due || 0));
  const flag = row.status === "inhouse" && row.checkOut < today ? "late" : row.status === "inhouse" && row.checkOut === today ? "due-out" : "";
  return {
    id: row.id,
    name: row.guestName,
    room: roomNumbers(row, onlyInhouse),
    phone: row.guestPhone || "",
    code: row.pmsCode || "",
    source: sourceLabel(row.source || ""),
    status: row.status,
    mark: MARK[row.status] || row.status,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    total: Math.max(0, Math.round(row.total || 0)),
    due,
    flag,
  };
}

function byRoom(a: DeskGuest, b: DeskGuest) {
  return a.room.localeCompare(b.room, "en", { numeric: true }) || a.name.localeCompare(b.name, "vi");
}

function unique(rows: DeskGuest[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function moneyOf(rows: DeskBooking[], from: string, to: string, label: string, today: string): DeskMoney {
  const report = roomRevenueReport(
    rows.map((row) => ({ ...row, deposit: row.deposit || 0 })),
    from,
    to,
    today,
  );
  return {
    label,
    count: report.booked.length,
    total: report.pnl.total,
    direct: report.pnl.direct,
    ota: report.pnl.ota,
    hotelNet: report.pnl.hotelNet,
    due: report.booking.due,
    recognized: report.recognizedPnl.total,
  };
}

export function foldDeskText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

export function findDeskGuests(guests: DeskGuest[], query: string) {
  const q = foldDeskText(query);
  if (!q) return [];
  if (/^\d{2,4}$/.test(q)) {
    return guests.filter((guest) => guest.room.split(/[,\s]+/).includes(q) || guest.code.toLowerCase() === q);
  }
  return guests.filter((guest) => {
    const name = foldDeskText(guest.name);
    const source = foldDeskText(guest.source);
    return name.includes(q) || foldDeskText(guest.code).includes(q) || foldDeskText(guest.phone).includes(q) || (q.length >= 4 && source.includes(q));
  });
}

export function buildDeskBrief(input: {
  today: string;
  date: string;
  onDate: DeskBooking[];
  inhouse: DeskBooking[];
  month: DeskBooking[];
  vacantRooms: string[];
  occupancy: DeskBrief["occupancy"];
  query?: string;
}): DeskBrief {
  const arrivals = input.onDate
    .filter((row) => row.checkIn === input.date && ARRIVAL_STATUSES.has(row.status))
    .map((row) => guestOf(row, input.today))
    .sort(byRoom);
  const departures = input.onDate
    .filter((row) => row.checkOut === input.date && DEPARTURE_STATUSES.has(row.status))
    .map((row) => guestOf(row, input.today))
    .sort(byRoom);
  const inhouse = input.inhouse
    .filter((row) => row.status === "inhouse")
    .map((row) => guestOf(row, input.today, true))
    .sort((a, b) => Number(b.flag === "late") - Number(a.flag === "late") || Number(b.flag === "due-out") - Number(a.flag === "due-out") || byRoom(a, b));
  const due = unique(
    [...inhouse, ...arrivals].filter((row) => row.due > 0 && (row.status === "inhouse" || row.status === "reserved")),
  ).sort((a, b) => b.due - a.due || byRoom(a, b));
  const roster = unique([
    ...inhouse,
    ...arrivals,
    ...departures,
    ...input.month.map((row) => guestOf(row, input.today)),
  ]);
  const monthFrom = startOfMonthVN(input.date);
  const monthLabel = `Tháng ${Number(input.date.slice(5, 7))}/${input.date.slice(0, 4)}`;
  return {
    today: input.today,
    date: input.date,
    arrivals,
    departures,
    inhouse,
    due,
    found: input.query ? findDeskGuests(roster, input.query).slice(0, 20) : [],
    vacantRooms: [...input.vacantRooms].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    occupancy: input.occupancy,
    revenue: {
      month: moneyOf(input.month, monthFrom, addMonthsVN(monthFrom, 1), monthLabel, input.today),
      day: moneyOf(input.month, input.date, addDaysVN(input.date, 1), input.date, input.today),
    },
  };
}
