import { extraAmount } from "../extras";
import { bookingDue, bookingRefundKeep, bookingSettledTotal, refundTotal, salePaid } from "./money";
import { bookingQuote, nightsBetween } from "./quote";
import { billableSaleRows } from "./status";

type MoneyRoom = {
  status: string;
  rate: number;
  checkIn: string;
  checkOut: string;
  breakfast?: boolean | null;
  discountKind?: string | null;
  discountValue?: number | null;
  deposit?: number | null;
  checkinPaid?: number | null;
  cashPaid?: number | null;
  transferPaid?: number | null;
  companyPaid?: number | null;
  refundCash?: number | null;
  refundTransfer?: number | null;
  refundCompany?: number | null;
};

type MoneyExtra = { qty: number; unitPrice: number; unit: string };

export function computeBookingMoney(rooms: MoneyRoom[], extras: MoneyExtra[] = []) {
  if (!rooms.length) {
    return {
      nights: 0,
      subtotal: 0,
      discount: 0,
      breakfastOff: 0,
      roomTotal: 0,
      extrasTotal: 0,
      quoted: 0,
      refundKeep: 0,
      total: 0,
      deposit: 0,
      checkinPaid: 0,
      refunded: 0,
      due: 0,
    };
  }
  const priced = billableSaleRows(rooms);
  const quote = bookingQuote(priced);
  const head = priced[0];
  const paid = salePaid(head);
  const checkIn = priced.reduce((min, row) => (row.checkIn < min ? row.checkIn : min), head.checkIn);
  const checkOut = priced.reduce((max, row) => (row.checkOut > max ? row.checkOut : max), head.checkOut);
  const nights = Math.max(quote.nights, nightsBetween(checkIn, checkOut));
  const extrasTotal = extras.reduce((sum, row) => sum + extraAmount(row, nights), 0);
  const roomTotal = quote.total;
  const quoted = roomTotal + extrasTotal;
  const refunded = rooms.reduce((max, row) => Math.max(max, refundTotal(row)), 0);
  const total = bookingSettledTotal(quoted, paid.deposit, refunded);
  return {
    nights,
    subtotal: quote.subtotal,
    discount: quote.discount,
    breakfastOff: quote.breakfastOff,
    roomTotal,
    extrasTotal,
    quoted,
    refundKeep: bookingRefundKeep(quoted, total),
    total,
    deposit: paid.deposit,
    checkinPaid: Math.max(0, Math.round(head.checkinPaid || 0)),
    refunded,
    due: bookingDue(total, paid.deposit, refunded),
  };
}
