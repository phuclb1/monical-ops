import { redirect } from "next/navigation";
import { disconnectZaloAction, saveZaloPhoneAction } from "@/actions/zalo";
import { SettingsNav } from "@/components/settings-nav";
import { ZaloConnectButton, ZaloGroupPicker } from "@/components/zalo-settings";
import { Btn, Card, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { loadZaloPublicStatus } from "@/lib/zalo-session";

const SAVED = {
  phone: "Đã lưu số Zalo.",
  group: "Đã lưu nhóm nhận tin.",
  cleared: "Đã xóa phiên Zalo.",
} as const;

export default async function ZaloSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSettings")) redirect("/settings");
  const { error, saved } = await searchParams;
  const zalo = await loadZaloPublicStatus();
  const savedText = saved && saved in SAVED ? SAVED[saved as keyof typeof SAVED] : "";

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Zalo</h1>
        <p className="text-xs text-[#5c6665]">Số gửi tin và nhóm nhận việc. Phiên đăng nhập được lưu trong cơ sở dữ liệu.</p>
      </div>
      <SettingsNav role={user.role} current="/settings/zalo" />
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      {savedText ? <p className="text-sm font-medium text-[#1b7a4e]">{savedText}</p> : null}

      <Card>
        <h2 className="mb-2 font-bold">Số gửi tin</h2>
        <form action={saveZaloPhoneAction} className="space-y-3">
          <Field label="Số Zalo của khách sạn">
            <input name="phone" defaultValue={zalo.phone} placeholder="0901234567" autoComplete="off" inputMode="tel" />
          </Field>
          <p className="text-xs leading-5 text-[#5c6665]">Đổi số sẽ xóa phiên đang lưu. Quét mã bằng Zalo của đúng số này.</p>
          <Btn type="submit">Lưu số</Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Phiên đăng nhập</h2>
        {zalo.connected ? (
          <div className="mb-3 space-y-1 text-sm">
            <p>Đã lưu{zalo.accountName ? `: ${zalo.accountName}` : ""}{zalo.accountPhone ? ` · ${zalo.accountPhone}` : ""}.</p>
            <p>Ghi cookie lần cuối: {formatDateTime(zalo.savedAt)}.</p>
            <p>Cookie mã hóa còn tới {formatDateTime(zalo.encryptUntil)}. Cookie đăng nhập còn tới {formatDateTime(zalo.loginUntil)}.</p>
            <p className="text-xs leading-5 text-[#5c6665]">
              Mỗi lần gửi tin hoặc tải nhóm, cookie mới được ghi lại. Cookie mã hóa khoảng 7 ngày nếu không dùng. Cookie đăng nhập khoảng 1 năm. Mở Zalo Web trên cùng số này làm phiên đã lưu hết hiệu lực.
            </p>
          </div>
        ) : (
          <p className="mb-3 text-sm text-[#5c6665]">Chưa có phiên. Lưu số, rồi quét mã để lưu cookie vào cơ sở dữ liệu.</p>
        )}
        {zalo.phone ? <ZaloConnectButton /> : <p className="text-sm">Lưu số Zalo trước khi kết nối.</p>}
        {zalo.connected ? (
          <form action={disconnectZaloAction} className="mt-3">
            <Btn type="submit" variant="ghost">
              Xóa phiên đã lưu
            </Btn>
          </form>
        ) : null}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Nhóm nhận tin</h2>
        {zalo.connected ? (
          <ZaloGroupPicker currentId={zalo.groupId} currentName={zalo.groupName} />
        ) : (
          <p className="text-sm text-[#5c6665]">Kết nối Zalo xong mới chọn được nhóm.</p>
        )}
      </Card>
    </main>
  );
}
