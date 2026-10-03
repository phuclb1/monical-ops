import { redirect } from "next/navigation";
import { disconnectZaloAction, saveZaloPhoneAction } from "@/actions/zalo";
import { SettingsNav } from "@/components/settings-nav";
import { ZaloConnectButton, ZaloGroupManager, ZaloMessageManager, ZaloTestSend } from "@/components/zalo-settings";
import { Btn, Card, Field, TabChip } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { can } from "@/lib/permissions";
import { loadZaloPublicStatus } from "@/lib/zalo-session";
import { ZALO_GROUP_SLOTS, ZALO_MESSAGE_DEFS } from "@/lib/zalo-messages";

const SAVED: Record<string, string> = {
  phone: "Đã lưu số Zalo.",
  booking: "Đã lưu nhóm booking.",
  reception: "Đã lưu nhóm lễ tân.",
  "daily-reception": "Đã lưu bản tin lễ tân.",
  "daily-breakfast": "Đã lưu báo cáo ăn sáng.",
  "booking-created": "Đã lưu tin booking mới.",
  "booking-updated": "Đã lưu tin sửa booking.",
  "booking-checkin-paid": "Đã lưu tin check-in đã thu đủ.",
  test: "Đã gửi tin thử.",
  cleared: "Đã xóa phiên Zalo.",
};

const EVENT_LABEL = {
  booking_created: "khi có booking mới",
  booking_updated: "khi sửa booking",
  booking_checkin_paid: "khi khách check-in và đã thu đủ tiền",
} as const;

export default async function ZaloSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; tab?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageSettings")) redirect("/settings");
  const { error, saved, tab } = await searchParams;
  const current = tab === "messages" ? "messages" : "groups";
  const zalo = await loadZaloPublicStatus();
  const savedText = saved ? SAVED[saved] || "" : "";

  return (
    <main className="space-y-3 px-3 py-4">
      <div>
        <h1 className="text-xl font-bold">Zalo</h1>
        <p className="text-xs text-[#5c6665]">Nhóm và nội dung tin cấu hình riêng.</p>
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

      <div className="tab-scroller -mx-3 px-3 pb-1">
        <TabChip href="/settings/zalo?tab=groups" active={current === "groups"}>
          Nhóm
        </TabChip>
        <TabChip href="/settings/zalo?tab=messages" active={current === "messages"}>
          Tin
        </TabChip>
      </div>

      {current === "groups" ? (
        <Card>
          <h2 className="mb-2 font-bold">Nhóm Zalo</h2>
          <p className="mb-3 text-xs leading-5 text-[#5c6665]">Chọn nhóm lễ tân và nhóm booking trên Zalo. Tin sẽ gửi vào nhóm được gán ở tab Tin.</p>
          <ZaloGroupManager
            connected={zalo.connected}
            groups={ZALO_GROUP_SLOTS.map((slot) => {
              const savedGroup = zalo.groups.find((item) => item.slot === slot.slot);
              return {
                slot: slot.slot,
                label: slot.label,
                groupId: savedGroup?.groupId || "",
                groupName: savedGroup?.groupName || "",
              };
            })}
          />
        </Card>
      ) : (
        <Card>
          <h2 className="mb-2 font-bold">Tin nhắn</h2>
          <p className="mb-3 text-xs leading-5 text-[#5c6665]">
            Bản tin lễ tân và báo cáo ăn sáng gửi mỗi ngày vào giờ đã chọn, giờ Việt Nam. Ăn sáng mặc định 05:00. Tin booking gửi khi tạo mới, khi sửa, hoặc khi khách check-in và đã thu đủ tiền.
          </p>
          <ZaloMessageManager
            messages={zalo.messages.map((message) => {
              const def = ZALO_MESSAGE_DEFS.find((item) => item.id === message.id);
              return {
                id: message.id,
                name: message.name,
                kind: message.kind,
                eventLabel: message.event ? EVENT_LABEL[message.event] : "",
                enabled: message.enabled,
                group: message.group,
                time: message.time,
                template: message.template,
                fields: def?.fields || "",
              };
            })}
          />
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-bold">Gửi thử</h2>
        <p className="mb-3 text-xs leading-5 text-[#5c6665]">Tin thử đi vào nhóm thật.</p>
        <ZaloTestSend
          connected={zalo.connected}
          groups={ZALO_GROUP_SLOTS.map((slot) => {
            const savedGroup = zalo.groups.find((item) => item.slot === slot.slot);
            return {
              slot: slot.slot,
              label: slot.label,
              groupId: savedGroup?.groupId || "",
              groupName: savedGroup?.groupName || "",
            };
          })}
        />
      </Card>
    </main>
  );
}
