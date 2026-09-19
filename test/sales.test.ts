import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPaidAmount,
  bookingDue,
  bookingDisplayCode,
  bookingPdfFilename,
  bookingQuote,
  catalogRate,
  discountLabel,
  formatVnd,
  ganttSpan,
  nightsBetween,
  nightlyCharge,
  nightlyNet,
  normalizeDiscount,
  parseDiscountKind,
  parseDiscountValue,
  parseMoney,
  parsePaymentMethod,
  parkingLabel,
  primaryPaymentMethod,
  salePaid,
  saleQuote,
  saleTotal,
} from "../src/lib/sales";

test("parseMoney strips non-digits and formatVnd round-trips", () => {
  assert.equal(parseMoney("1.500.000₫"), 1_500_000);
  assert.equal(parseMoney(""), 0);
  const formatted = formatVnd(1_500_000);
  assert.ok(formatted.endsWith("₫"));
  assert.equal(parseMoney(formatted), 1_500_000);
});

test("booking quote: nights, percent discount, amount discount", () => {
  const twoNights = bookingQuote([
    { rate: 1_000_000, checkIn: "2026-09-19", checkOut: "2026-09-21", discountKind: "percent", discountValue: 10 },
  ]);
  assert.equal(nightsBetween("2026-09-19", "2026-09-21"), 2);
  assert.equal(twoNights.nights, 2);
  assert.equal(twoNights.subtotal, 2_000_000);
  assert.equal(twoNights.discount, 200_000);
  assert.equal(twoNights.total, 1_800_000);

  const amount = saleQuote({
    rate: 500_000,
    checkIn: "2026-09-19",
    checkOut: "2026-09-20",
    discountKind: "amount",
    discountValue: 50_000,
  });
  assert.equal(amount.nights, 1);
  assert.equal(amount.total, 450_000);
  assert.equal(saleTotal(500_000, "2026-09-19", "2026-09-20"), 500_000);
  assert.equal(nightlyCharge(500_000), 500_000);
  assert.equal(nightlyNet({ rate: 1_000_000, checkIn: "2026-09-19", checkOut: "2026-09-21", discountKind: "percent", discountValue: 10 }), 900_000);
});

test("percent over 100 is treated as amount on quote, rejected by normalizeDiscount", () => {
  const quoted = saleQuote({
    rate: 1_000_000,
    checkIn: "2026-09-19",
    checkOut: "2026-09-20",
    discountKind: "percent",
    discountValue: 150_000,
  });
  assert.equal(quoted.discountKind, "amount");
  assert.equal(quoted.discount, 150_000);
  assert.throws(() => normalizeDiscount("percent", 150), /100/);
  assert.deepEqual(normalizeDiscount("none", 99), { discountKind: "none", discountValue: 0 });
  assert.equal(parseDiscountKind("percent"), "percent");
  assert.equal(parseDiscountValue("percent", "12,5%"), 13);
});

test("ganttSpan clips to the visible window", () => {
  const span = ganttSpan("2026-09-20", "2026-09-22", "2026-09-19", 7);
  assert.ok(span);
  assert.equal(span.start, 1.5);
  assert.equal(span.end, 3.5);
  assert.equal(span.nightStart, 1);
  assert.equal(span.nightEnd, 3);
  assert.equal(ganttSpan("2026-09-10", "2026-09-11", "2026-09-19", 7), null);
});

test("catalogRate uses weekendRate on holiday/weekend nights", () => {
  const type = { baseRate: 800_000, weekendRate: 1_000_000 };
  assert.equal(catalogRate(type, "2026-09-21"), 800_000);
  assert.equal(catalogRate(type, "2026-09-19"), 1_000_000);
  assert.equal(catalogRate(undefined, "2026-09-19"), 0);
});

test("payment split, due, labels, codes", () => {
  assert.deepEqual(salePaid({ deposit: 200_000 }), {
    cashPaid: 0,
    transferPaid: 200_000,
    companyPaid: 0,
    deposit: 200_000,
  });
  const increased = applyPaidAmount({ cashPaid: 100_000, transferPaid: 0, companyPaid: 0, deposit: 100_000 }, 250_000, "personal");
  assert.equal(increased.deposit, 250_000);
  assert.equal(increased.transferPaid, 150_000);
  const reduced = applyPaidAmount(increased, 50_000, "personal");
  assert.equal(reduced.deposit, 50_000);
  assert.equal(bookingDue(1_000_000, 250_000), 750_000);
  assert.equal(primaryPaymentMethod({ cashPaid: 10, transferPaid: 5, companyPaid: 0, deposit: 15 }), "cash");
  assert.equal(parsePaymentMethod("company"), "company");
  assert.equal(parsePaymentMethod("other"), "personal");
  assert.equal(parkingLabel(1, 2), "1 ô tô · 2 xe máy");
  assert.equal(parkingLabel(), "—");
  assert.equal(discountLabel("percent", 10), "10%");
  assert.equal(discountLabel("none", 0), "Không");
  assert.equal(bookingDisplayCode({ id: "abc", pmsCode: " BK-09-1 " }), "BK-09-1");
  assert.equal(bookingPdfFilename({ id: "abc", pmsCode: "BK 09/1" }), "BK-09-1.pdf");
});
