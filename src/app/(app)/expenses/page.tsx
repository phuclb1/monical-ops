import { redirect } from "next/navigation";
import { createExpenseAction, deleteExpenseAction } from "@/actions/expenses";
import { ExpensePayerField } from "@/components/expense-payer-field";
import { OwnerPeriodBar } from "@/components/owner-period";
import { Btn, Card, Chip, Empty, Field, Stat } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateNumeric, todayVN } from "@/lib/datetime";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_FUND_LABEL,
  summarizeExpenses,
  type ExpenseCategory,
  type ExpenseFund,
} from "@/lib/expenses";
import { homePath } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { listExpensePayers, listExpenses, listUsers } from "@/lib/repos";
import { formatVnd } from "@/lib/sales";
import { parsePeriodQuery } from "@/lib/sales-report";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ grain?: string; date?: string; error?: string; ok?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageExpenses")) redirect(homePath(user.role));

  const { grain: rawGrain, date: rawDate, error, ok } = await searchParams;
  const { grain, window } = parsePeriodQuery(rawGrain, rawDate);
  const today = todayVN();
  const defaultDate = today >= window.from && today < window.to ? today : window.from;
  const [rows, users, payers] = await Promise.all([
    listExpenses(window.from, window.to),
    listUsers(),
    listExpensePayers(),
  ]);
  const names = new Map(users.map((person) => [person.id, person.fullName]));
  const summary = summarizeExpenses(rows);

  return (
    <main className="space-y-3 px-3 py-4 md:space-y-4">
      <div>
        <h1 className="text-xl font-bold">Chi phí</h1>
        <p className="text-xs text-[#5c6665] md:text-sm">
          Chỉ quản lý nhập chi phí vận hành theo ngày, hạng mục, người chi, hóa đơn và nguồn tiền.
        </p>
      </div>

      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {ok === "1" ? <p className="text-sm font-semibold text-[#1b7a4e]">Đã lưu khoản chi.</p> : null}

      <OwnerPeriodBar basePath="/expenses" grain={grain} window={window} />

      <div className="revenue-stats">
        <Stat label="Tổng chi" value={formatVnd(summary.total)} />
        <Stat label="Tài khoản công ty" value={formatVnd(summary.company)} />
        <Stat label="Tài khoản cá nhân" value={formatVnd(summary.personal)} />
        <Stat label="Có hóa đơn" value={formatVnd(summary.invoiced)} />
        <Stat label="Không hóa đơn" value={formatVnd(summary.noInvoice)} />
      </div>

      <div className="revenue-stats">
        {EXPENSE_CATEGORIES.map((category) => (
          <Stat key={category} label={EXPENSE_CATEGORY_LABEL[category]} value={formatVnd(summary.byCategory[category])} />
        ))}
      </div>

      <div className="md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-4">
        <Card>
          <h2 className="mb-2 font-bold">Nhập chi phí</h2>
          <form action={createExpenseAction} className="space-y-2">
            <input type="hidden" name="grain" value={grain} />
            <Field label="Ngày chi">
              <input name="spentOn" type="date" required defaultValue={defaultDate} />
            </Field>
            <Field label="Hạng mục chi">
              <select name="category" required defaultValue="">
                <option value="" disabled>
                  Chọn hạng mục
                </option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {EXPENSE_CATEGORY_LABEL[category]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số tiền (₫)">
              <input name="amount" inputMode="numeric" required placeholder="0" />
            </Field>
            <Field label="Hóa đơn">
              <select name="hasInvoice" required defaultValue="">
                <option value="" disabled>
                  Chọn
                </option>
                <option value="yes">Có hóa đơn</option>
                <option value="no">Không hóa đơn</option>
              </select>
            </Field>
            <Field label="Chi từ">
              <select name="fundedBy" required defaultValue="">
                <option value="" disabled>
                  Chọn tài khoản
                </option>
                <option value="company">Tài khoản công ty</option>
                <option value="personal">Tài khoản cá nhân</option>
              </select>
            </Field>
            <ExpensePayerField labels={payers} />
            <Field label="Nội dung">
              <input name="note" maxLength={200} placeholder="Không bắt buộc" />
            </Field>
            <Btn type="submit" className="w-full">
              Lưu khoản chi
            </Btn>
          </form>
        </Card>

        <Card>
          <h2 className="mb-2 font-bold">Đã nhập ({rows.length})</h2>
          {rows.length ? (
            <div className="space-y-2">
              {rows.map((row) => {
                const category = row.category as ExpenseCategory;
                const fund = row.fundedBy as ExpenseFund;
                return (
                  <div key={row.id} className="rounded-xl bg-sand px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold">{EXPENSE_CATEGORY_LABEL[category] || row.category}</p>
                        <p className="text-xs text-[#5c6665]">
                          {formatDateNumeric(row.spentOn)}
                          {names.get(row.createdBy) ? ` · ${names.get(row.createdBy)}` : ""}
                        </p>
                        {row.note ? <p className="mt-1 text-sm">{row.note}</p> : null}
                      </div>
                      <span className="shrink-0 text-sm font-bold">{formatVnd(row.amount)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Chip tone={row.hasInvoice ? "ok" : "warn"}>{row.hasInvoice ? "Có hóa đơn" : "Không hóa đơn"}</Chip>
                      <Chip tone={fund === "company" ? "teal" : "gold"}>{EXPENSE_FUND_LABEL[fund] || row.fundedBy}</Chip>
                      {row.spentBy ? <Chip>{row.spentBy}</Chip> : null}
                    </div>
                    <form action={deleteExpenseAction} className="mt-2">
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="grain" value={grain} />
                      <input type="hidden" name="date" value={window.from} />
                      <Btn type="submit" variant="ghost" className="w-full">
                        Xóa
                      </Btn>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title="Chưa có khoản chi trong kỳ" text="Đổi tháng, quý hoặc năm, hoặc nhập khoản mới." />
          )}
        </Card>
      </div>
    </main>
  );
}
