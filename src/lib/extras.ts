export const EXTRA_UNITS = ["night", "kg", "once"] as const;
export type ExtraUnit = (typeof EXTRA_UNITS)[number];

export const EXTRA_TYPE_SEED = [
  { id: "ex-adult", code: "adult", name: "Phụ thu người lớn", unitPrice: 300000, unit: "night" as const, unitLabel: "người/đêm", sortOrder: 10 },
  { id: "ex-child", code: "child", name: "Phụ thu trẻ em", unitPrice: 200000, unit: "night" as const, unitLabel: "bé/đêm", sortOrder: 20 },
  { id: "ex-mattress", code: "mattress", name: "Thêm đệm", unitPrice: 150000, unit: "night" as const, unitLabel: "đệm/đêm", sortOrder: 30 },
  { id: "ex-laundry", code: "laundry", name: "Giặt sấy khô", unitPrice: 50000, unit: "kg" as const, unitLabel: "kg", sortOrder: 40 },
] as const;

export type ExtraInput = {
  qty: number;
  unitPrice: number;
  unit: string;
};

export function extraAmount(row: ExtraInput, nights: number) {
  const qty = Math.max(0, row.qty || 0);
  const price = Math.max(0, Math.round(row.unitPrice || 0));
  if (row.unit === "night") return qty * price * Math.max(0, nights);
  return qty * price;
}

export function extraQtyLabel(unit: string) {
  if (unit === "kg") return "Số kg";
  if (unit === "night") return "Số lượng";
  return "Số lượng";
}

export function extraUnitText(unit: string) {
  if (unit === "night") return "đêm";
  if (unit === "kg") return "kg";
  return "";
}

export function extraDetail(row: ExtraInput & { name: string }, nights: number) {
  const qty = Math.max(0, row.qty || 0);
  if (row.unit === "night") return `${qty} × ${Math.max(0, nights)} đêm`;
  if (row.unit === "kg") return `${qty} kg`;
  return qty > 1 ? `${qty}` : "";
}
