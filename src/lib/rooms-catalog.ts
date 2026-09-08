export const ROOM_TYPE_SEED = [
  { id: "rt-vip", code: "vip", name: "VIP", sortOrder: 10 },
  { id: "rt-senior", code: "senior", name: "SENIOR", sortOrder: 20 },
  { id: "rt-deluxe", code: "deluxe", name: "DELUXE", sortOrder: 30 },
  { id: "rt-deluxe-view", code: "deluxe-view", name: "DELUXE VIEW", sortOrder: 40 },
  { id: "rt-superior", code: "superior", name: "SUPERIOR", sortOrder: 50 },
  { id: "rt-superior-view", code: "superior-view", name: "SUPERIOR VIEW", sortOrder: 60 },
  { id: "rt-standard", code: "standard", name: "STANDARD", sortOrder: 70 },
  { id: "rt-standard-view", code: "standard-view", name: "STANDARD VIEW", sortOrder: 80 },
  { id: "rt-family-plus", code: "family-plus", name: "FAMILY PLUS", sortOrder: 90 },
  { id: "rt-family", code: "family", name: "FAMILY", sortOrder: 100 },
  { id: "rt-family-view", code: "family-view", name: "FAMILY VIEW", sortOrder: 110 },
  { id: "rt-dorm", code: "dorm", name: "DORM", sortOrder: 120 },
  { id: "rt-triple", code: "triple", name: "TRIPLE", sortOrder: 130 },
  { id: "rt-twin", code: "twin", name: "TWIN", sortOrder: 140 },
] as const;

export const ROOM_SEED = [
  { number: "506", type: "VIP" },
  { number: "406", type: "VIP" },
  { number: "302", type: "SENIOR" },
  { number: "402", type: "SENIOR" },
  { number: "502", type: "SENIOR" },
  { number: "301", type: "DELUXE" },
  { number: "401", type: "DELUXE" },
  { number: "501", type: "DELUXE" },
  { number: "508", type: "DELUXE VIEW" },
  { number: "102", type: "SUPERIOR" },
  { number: "203", type: "SUPERIOR" },
  { number: "305", type: "SUPERIOR VIEW" },
  { number: "405", type: "SUPERIOR VIEW" },
  { number: "505", type: "SUPERIOR VIEW" },
  { number: "104", type: "STANDARD" },
  { number: "205", type: "STANDARD" },
  { number: "307", type: "STANDARD VIEW" },
  { number: "407", type: "STANDARD VIEW" },
  { number: "507", type: "STANDARD VIEW" },
  { number: "103", type: "FAMILY PLUS" },
  { number: "204", type: "FAMILY PLUS" },
  { number: "101", type: "FAMILY" },
  { number: "202", type: "FAMILY" },
  { number: "304", type: "FAMILY" },
  { number: "404", type: "FAMILY" },
  { number: "504", type: "FAMILY VIEW" },
  { number: "403", type: "DORM" },
  { number: "206", type: "TRIPLE" },
  { number: "308", type: "TRIPLE" },
  { number: "408", type: "TRIPLE" },
  { number: "105", type: "TWIN" },
] as const;

export const ROOM_REMAP: Record<string, string> = {
  "r-201": "r-105",
};

export function floorOf(number: string) {
  const floor = Number(number.replace(/\D/g, "")[0]);
  if (!floor) throw new Error("Số phòng không hợp lệ");
  return floor;
}

export function roomIdOf(number: string) {
  return `r-${number}`;
}

export function slugTypeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
