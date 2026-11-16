import { HOTEL_BANK_HOLDER, HOTEL_LETTERHEAD, HOTEL_VIETQR_ACCOUNT, HOTEL_VIETQR_BANK } from "@/lib/constants";

export function bookingCollectMemo(code: string) {
  const label = code
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .replace(/[^A-Za-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `Thu du tien booking ${label}`.trim().slice(0, 94);
}

export function bookingVietQrUrl(amount: number, code: string) {
  const money = Math.round(amount);
  if (!Number.isFinite(money) || money <= 0) return "";
  const params = new URLSearchParams({
    bank: HOTEL_VIETQR_BANK,
    acc: HOTEL_VIETQR_ACCOUNT,
    template: "standee",
    holder: HOTEL_BANK_HOLDER,
    store: HOTEL_LETTERHEAD.toUpperCase(),
    amount: String(money),
    des: bookingCollectMemo(code),
  });
  return `https://vietqr.app/img?${params.toString()}`;
}
