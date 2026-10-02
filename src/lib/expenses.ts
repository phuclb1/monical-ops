export const EXPENSE_CATEGORIES = ["kitchen", "reception", "hotel", "management"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  kitchen: "Bếp",
  reception: "Lễ tân",
  hotel: "Khách sạn",
  management: "Quản lý",
};

export const EXPENSE_FUNDS = ["company", "personal"] as const;
export type ExpenseFund = (typeof EXPENSE_FUNDS)[number];

export const EXPENSE_FUND_LABEL: Record<ExpenseFund, string> = {
  company: "Tài khoản công ty",
  personal: "Tài khoản cá nhân",
};

export type ExpenseDraft = {
  spentOn: string;
  category: ExpenseCategory;
  amount: number;
  hasInvoice: boolean;
  fundedBy: ExpenseFund;
  note: string | null;
};

export type ExpenseSummaryRow = {
  category: string;
  amount: number;
  hasInvoice: boolean;
  fundedBy: string;
};

export function parseExpenseForm(raw: {
  spentOn: string;
  category: string;
  amount: number;
  hasInvoice: string;
  fundedBy: string;
  note: string;
}): ExpenseDraft {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.spentOn)) throw new Error("Chọn ngày chi");
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(raw.category)) throw new Error("Chọn hạng mục chi");
  if (!Number.isFinite(raw.amount) || raw.amount <= 0) throw new Error("Nhập số tiền lớn hơn 0");
  if (raw.hasInvoice !== "yes" && raw.hasInvoice !== "no") throw new Error("Chọn có hóa đơn hay không");
  if (raw.fundedBy !== "company" && raw.fundedBy !== "personal") throw new Error("Chọn chi từ tài khoản công ty hay cá nhân");
  const note = raw.note.trim();
  if (note.length > 200) throw new Error("Nội dung tối đa 200 ký tự");
  return {
    spentOn: raw.spentOn,
    category: raw.category as ExpenseCategory,
    amount: Math.round(raw.amount),
    hasInvoice: raw.hasInvoice === "yes",
    fundedBy: raw.fundedBy,
    note: note || null,
  };
}

export function summarizeExpenses(rows: ExpenseSummaryRow[]) {
  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0])) as Record<ExpenseCategory, number>;
  let total = 0;
  let company = 0;
  let personal = 0;
  let invoiced = 0;
  let noInvoice = 0;
  for (const row of rows) {
    const amount = Math.max(0, Math.round(row.amount || 0));
    total += amount;
    if ((EXPENSE_CATEGORIES as readonly string[]).includes(row.category)) {
      byCategory[row.category as ExpenseCategory] += amount;
    }
    if (row.fundedBy === "company") company += amount;
    else if (row.fundedBy === "personal") personal += amount;
    if (row.hasInvoice) invoiced += amount;
    else noInvoice += amount;
  }
  return { total, company, personal, invoiced, noInvoice, byCategory };
}
