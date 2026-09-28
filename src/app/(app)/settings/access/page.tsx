import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveAccessSettingsAction } from "@/actions/settings";
import { SettingsNav } from "@/components/settings-nav";
import { Btn, Card, Chip, Empty, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatAuditWhen } from "@/lib/audit-view";
import { can } from "@/lib/permissions";
import { clientIp } from "@/lib/reception-ip";
import { listLoginEvents, loadReceptionIpPolicy } from "@/lib/repos/access";

const RESULT_LABEL = {
  ok: "Thành công",
  denied: "Sai mật khẩu",
  ip: "Sai IP",
} as const;

export default async function AccessSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSettings")) redirect("/settings");
  const { error, saved } = await searchParams;
  const [policy, events, here] = await Promise.all([
    loadReceptionIpPolicy(),
    listLoginEvents(),
    headers().then((store) => clientIp(store)),
  ]);

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Cấu hình</h1>
        <p className="text-xs text-[#5c6665]">Chỉ quản lý. Giới hạn máy lễ tân đăng nhập, và xem lịch sử đăng nhập.</p>
      </div>
      <SettingsNav role={user.role} current="/settings/access" />
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      {saved ? <p className="text-sm font-medium text-[#1b7a4e]">Đã lưu cấu hình.</p> : null}

      <Card>
        <h2 className="mb-2 font-bold">IP tài khoản lễ tân</h2>
        <form action={saveAccessSettingsAction} className="space-y-3">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
            <input type="checkbox" name="restrict" defaultChecked={policy.enabled} />
            <span className="text-sm font-semibold">Chỉ cho lễ tân đăng nhập từ một IP</span>
          </label>
          <Field label="IP được phép">
            <input name="ip" defaultValue={policy.ip ?? ""} placeholder="117.2.80.239" autoComplete="off" />
          </Field>
          <p className="text-xs leading-5 text-[#5c6665]">
            Bật giới hạn thì phải điền IP public của máy quầy. Tắt thì lễ tân vào được từ mọi mạng.
            {here ? ` IP hiện tại của bạn: ${here}.` : ""}
          </p>
          <Btn type="submit">Lưu</Btn>
        </form>
      </Card>

      <div>
        <h2 className="mb-2 text-[15px] font-bold">Lịch sử đăng nhập</h2>
        {events.length === 0 ? (
          <Empty title="Chưa có lần đăng nhập nào" text="Các lần sau sẽ hiện tài khoản, IP public và trình duyệt." />
        ) : (
          <div className="login-history">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Tài khoản</th>
                  <th>Kết quả</th>
                  <th>Trình duyệt</th>
                  <th>IP public</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="whitespace-nowrap">{formatAuditWhen(event.createdAt)}</td>
                    <td>
                      <p className="font-semibold">{event.fullName || event.username}</p>
                      <p className="text-xs text-[#5c6665]">{event.username}</p>
                    </td>
                    <td>
                      <Chip tone={event.result === "ok" ? "ok" : "danger"}>
                        {RESULT_LABEL[event.result as keyof typeof RESULT_LABEL] || event.result}
                      </Chip>
                    </td>
                    <td title={event.userAgent || undefined}>{event.browser || "Không rõ"}</td>
                    <td className="whitespace-nowrap font-semibold">{event.ip || "Không rõ"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
