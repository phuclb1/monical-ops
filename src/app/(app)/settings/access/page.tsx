import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveAccessSettingsAction, saveOpenApiWebhookAction } from "@/actions/settings";
import { OpenApiTokenPanel } from "@/components/open-api-settings";
import { SettingsNav } from "@/components/settings-nav";
import { PendingSubmit } from "@/components/pending-submit";
import { Card, Chip, Empty, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatAuditWhen } from "@/lib/audit-view";
import { formatDateTime } from "@/lib/datetime";
import { loadOpenApiSettings } from "@/lib/open-api-settings";
import { can } from "@/lib/permissions";
import { clientIp } from "@/lib/reception-ip";
import { listLoginEvents, loadReceptionIpPolicy } from "@/lib/repos/access";
import { appOrigin } from "@/lib/site";

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
  const [policy, events, here, openApi, origin] = await Promise.all([
    loadReceptionIpPolicy(),
    listLoginEvents(),
    headers().then((store) => clientIp(store)),
    loadOpenApiSettings(),
    appOrigin(),
  ]);
  const savedText =
    saved === "open-api-cleared"
      ? "Đã xóa token Open API."
      : saved === "open-api-webhook"
        ? "Đã lưu URL webhook Codex."
        : saved
          ? "Đã lưu cấu hình."
          : "";

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Cấu hình</h1>
        <p className="text-xs text-[#5c6665]">Chỉ quản lý. IP lễ tân, token Open API cho agent Codex, và lịch sử đăng nhập.</p>
      </div>
      <SettingsNav role={user.role} current="/settings/access" />
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      {savedText ? <p className="text-sm font-medium text-[#1b7a4e]">{savedText}</p> : null}

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
          <PendingSubmit pendingLabel="Đang lưu...">Lưu</PendingSubmit>
        </form>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-bold">Open API</h2>
          <Chip tone={openApi.hasToken ? "ok" : "warn"}>{openApi.hasToken ? "Đã có token" : "Chưa có token"}</Chip>
        </div>
        <p className="mb-3 text-xs leading-5 text-[#5c6665]">
          Agent Codex gọi API này để tạo / đọc booking rồi sync ezCloud. Token tạo ở đây, không để trong wrangler.
          Agent trên máy bạn nên GET booking mới mỗi 2 phút — không cần webhook.
          {openApi.tokenUpdatedAt ? ` Tạo lần cuối: ${formatDateTime(openApi.tokenUpdatedAt)}.` : ""}
        </p>
        <div className="mb-3 space-y-2">
          <Field label="Kéo booking mới / vừa sửa (poll 2 phút)">
            <input readOnly value={`${origin}/api/open/bookings?since=<polledAt lần trước>`} />
          </Field>
          <Field label="Tạo booking">
            <input readOnly value={`${origin}/api/open/bookings`} />
          </Field>
          <Field label="Lấy một booking">
            <input readOnly value={`${origin}/api/open/bookings/:id`} />
          </Field>
        </div>
        <OpenApiTokenPanel hasToken={openApi.hasToken} hint={openApi.tokenHint} />
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Webhook Codex</h2>
        <p className="mb-3 text-xs leading-5 text-[#5c6665]">
          Ops (máy chủ Cloudflare) POST tới URL này khi lễ tân tạo booking, đổi phòng hoặc thêm ngày. Để trống thì không gửi.
          URL phải là địa chỉ internet mà agent của bạn đang lắng nghe — không dùng localhost, vì máy chủ không gọi được máy bạn.
          Chạy Codex ở máy local thì mở tunnel (Cloudflare Tunnel / ngrok), rồi dán URL public, ví dụ https://ten-ban.trycloudflare.com/webhooks/ops-booking.
          Secret ký HMAC được tạo cùng API token.
        </p>
        <form action={saveOpenApiWebhookAction} className="space-y-3">
          <Field label="URL webhook">
            <input
              name="webhookUrl"
              defaultValue={openApi.webhookUrl}
              placeholder="https://ten-ban.trycloudflare.com/webhooks/ops-booking"
              autoComplete="off"
            />
          </Field>
          <p className="text-xs text-[#5c6665]">{openApi.hasWebhookSecret ? "Đã có secret ký webhook (hiện khi tạo token)." : "Chưa có secret. Tạo API token để sinh secret."}</p>
          <PendingSubmit pendingLabel="Đang lưu...">Lưu webhook</PendingSubmit>
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
