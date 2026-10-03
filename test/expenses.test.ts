import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePayer, parseExpenseForm, summarizeExpenses } from "../src/lib/expenses";

test("parse expense form accepts manager fields", () => {
  assert.deepEqual(
    parseExpenseForm({
      spentOn: "2026-10-01",
      category: "kitchen",
      amount: 150000,
      hasInvoice: "yes",
      fundedBy: "company",
      spentBy: "  nguyễn  lan  ",
      note: "  Gas bếp  ",
    }, ["Nguyễn Lan"]),
    {
      spentOn: "2026-10-01",
      category: "kitchen",
      amount: 150000,
      hasInvoice: true,
      fundedBy: "company",
      spentBy: "Nguyễn Lan",
      note: "Gas bếp",
    },
  );
});

test("new payer text becomes its own label and later matches that label", () => {
  assert.equal(normalizePayer("  Trần  An  "), "Trần An");
  assert.equal(normalizePayer("trần an", ["Trần An"]), "Trần An");
  assert.throws(() => normalizePayer("   "), /ai chi/);
});

test("parse expense form rejects missing invoice and fund", () => {
  assert.throws(
    () =>
      parseExpenseForm({
        spentOn: "2026-10-01",
        category: "hotel",
        amount: 1,
        hasInvoice: "",
        fundedBy: "personal",
        spentBy: "Lan",
        note: "",
      }),
    /hóa đơn/,
  );
  assert.throws(
    () =>
      parseExpenseForm({
        spentOn: "2026-10-01",
        category: "management",
        amount: 0,
        hasInvoice: "no",
        fundedBy: "personal",
        spentBy: "Lan",
        note: "",
      }),
    /số tiền/,
  );
});

test("expense summary splits category, invoice and account", () => {
  assert.deepEqual(
    summarizeExpenses([
      { category: "kitchen", amount: 100, hasInvoice: true, fundedBy: "company" },
      { category: "reception", amount: 40, hasInvoice: false, fundedBy: "personal" },
      { category: "hotel", amount: 60, hasInvoice: true, fundedBy: "personal" },
      { category: "management", amount: 20, hasInvoice: false, fundedBy: "company" },
    ]),
    {
      total: 220,
      company: 120,
      personal: 100,
      invoiced: 160,
      noInvoice: 60,
      byCategory: { kitchen: 100, reception: 40, hotel: 60, management: 20 },
    },
  );
});
