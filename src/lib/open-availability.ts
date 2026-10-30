import { roomAvailabilityTable, roomTypeAvailability, type Room, type RoomType } from "@/components/sale-form/shared";
import { addDaysVN, datesUntil } from "@/lib/datetime";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 62;

export type AvailabilityRoomType = RoomType & { code?: string | null };
export type AvailabilityBusy = { roomId: string; checkIn: string; checkOut: string };

export function parseOpenAvailabilityQuery(params: URLSearchParams) {
  const from = firstParam(params, ["from", "checkIn", "date", "arrivalDate"]);
  let to = firstParam(params, ["to", "checkOut", "departureDate"]);
  const type = firstParam(params, ["type", "roomType"]);
  if (!DATE.test(from)) throw new Error("Ngày không hợp lệ. Dùng from=YYYY-MM-DD");
  if (!to) to = addDaysVN(from, 1);
  if (!DATE.test(to) || to <= from) throw new Error("Ngày trả phải sau ngày nhận");
  const nights = datesUntil(from, to);
  if (nights.length > MAX_NIGHTS) throw new Error(`Chỉ xem tối đa ${MAX_NIGHTS} đêm`);
  if (!nights.length) throw new Error("Ngày trả phải sau ngày nhận");
  return { from, to, type };
}

export function openAvailability(input: {
  rooms: Room[];
  types: AvailabilityRoomType[];
  busy: AvailabilityBusy[];
  from: string;
  to: string;
  type?: string;
}) {
  const types = filterTypes(input.types, input.type);
  const names = new Set(types.map((type) => type.name));
  const rooms = input.type?.trim() ? input.rooms.filter((room) => names.has(room.type)) : input.rooms;
  const summary = roomTypeAvailability(rooms, types, input.from, input.to, input.busy);
  const grid = roomAvailabilityTable(rooms, types, input.from, input.to, input.busy);
  const listed = new Set(summary.map((row) => row.type));
  const nights = datesUntil(input.from, input.to);
  const rows = [
    ...summary.map((row) => shapeType(row.type, row.total, row.available, row.nights, grid, types)),
    ...types
      .filter((type) => input.type && !listed.has(type.name))
      .map((type) =>
        shapeType(
          type.name,
          0,
          0,
          nights.map((date) => ({ date, available: 0 })),
          [],
          types,
        ),
      ),
  ];
  return { from: input.from, to: input.to, types: rows };
}

function shapeType(
  type: string,
  total: number,
  available: number,
  nights: { date: string; available: number }[],
  grid: { number: string; type: string; nights: { date: string; available: boolean }[] }[],
  types: AvailabilityRoomType[],
) {
  const typeRooms = grid.filter((room) => room.type === type);
  return {
    type,
    code: types.find((row) => row.name === type)?.code ?? null,
    total,
    available,
    rooms: typeRooms.filter((room) => room.nights.every((night) => night.available)).map((room) => room.number),
    nights: nights.map((night) => ({
      date: night.date,
      available: night.available,
      total,
      rooms: typeRooms
        .filter((room) => room.nights.some((item) => item.date === night.date && item.available))
        .map((room) => room.number),
    })),
  };
}

function filterTypes(types: AvailabilityRoomType[], query?: string) {
  const wanted = (query || "").trim().toUpperCase();
  if (!wanted) return types;
  const matched = types.filter((type) => type.name.toUpperCase() === wanted || (type.code || "").toUpperCase() === wanted);
  if (!matched.length) throw new Error("Không thấy hạng phòng");
  return matched;
}

function firstParam(params: URLSearchParams, keys: string[]) {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }
  return "";
}
