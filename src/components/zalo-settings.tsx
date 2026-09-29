"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { listZaloGroupsAction, saveZaloGroupSlotAction, saveZaloMessageAction, sendZaloMessageTestAction, sendZaloTestAction } from "@/actions/zalo";
import { Btn, Field } from "@/components/ui";
import type { ZaloGroupSlot } from "@/lib/zalo-messages";

export function ZaloConnectButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "wait" | "qr" | "scanned" | "error">("idle");
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function connect() {
    setPhase("wait");
    setError("");
    setImage("");
    const response = await fetch("/api/zalo/connect", { method: "POST" });
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setPhase("error");
      setError(data.error || "Không mở được mã QR.");
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const line = part.split("\n").find((item) => item.startsWith("data:"));
        if (!line) continue;
        const event = JSON.parse(line.slice(5).trim()) as { status?: string; image?: string; name?: string; message?: string };
        if (event.status === "qr" && event.image) {
          setPhase("qr");
          setImage(event.image);
        } else if (event.status === "scanned") {
          setPhase("scanned");
          setName(event.name || "");
        } else if (event.status === "done") {
          finished = true;
          setPhase("idle");
          setImage("");
          router.refresh();
        } else if (event.status === "error" || event.status === "expired" || event.status === "declined") {
          finished = true;
          setPhase("error");
          setImage("");
          setError(event.message || "Không kết nối được Zalo.");
        }
      }
    }
    if (!finished) {
      setPhase("error");
      setError("Kết nối bị ngắt trước khi lưu phiên. Bấm kết nối lại và quét mã.");
    }
  }

  return (
    <div className="space-y-3">
      <Btn type="button" onClick={connect} disabled={phase === "wait" || phase === "qr" || phase === "scanned"}>
        {phase === "wait" ? "Đang tạo mã..." : "Kết nối Zalo"}
      </Btn>
      {phase === "qr" && image ? (
        <div className="space-y-2">
          <img src={`data:image/png;base64,${image}`} alt="Mã QR đăng nhập Zalo" className="h-56 w-56 rounded-xl bg-white p-2" />
          <p className="text-xs leading-5 text-[#5c6665]">Mở Zalo trên đúng số đã lưu, quét mã này. Mã sống khoảng 100 giây và được tạo lại tối đa hai lần.</p>
        </div>
      ) : null}
      {phase === "scanned" ? <p className="text-sm font-medium">Đã quét{name ? ` bởi ${name}` : ""}. Xác nhận trên điện thoại.</p> : null}
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
    </div>
  );
}

export function ZaloGroupManager({
  connected,
  groups,
}: {
  connected: boolean;
  groups: { slot: ZaloGroupSlot; label: string; groupId: string; groupName: string }[];
}) {
  const [options, setOptions] = useState<{ id: string; name: string; members: number }[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    setPending(true);
    setError("");
    const result = await listZaloGroupsAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOptions(result.groups);
  }

  return (
    <div className="space-y-4">
      <Btn type="button" variant="ghost" onClick={load} disabled={!connected || pending}>
        {pending ? "Đang tải nhóm..." : "Tải danh sách nhóm Zalo"}
      </Btn>
      {!connected ? <p className="text-sm text-[#5c6665]">Kết nối Zalo rồi mới chọn được nhóm.</p> : null}
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      {groups.map((slot) => {
        const choices = options ? [...options] : [];
        if (slot.groupId && !choices.some((group) => group.id === slot.groupId)) {
          choices.unshift({ id: slot.groupId, name: slot.groupName || slot.groupId, members: 0 });
        }
        return (
          <form key={slot.slot} action={saveZaloGroupSlotAction} className="space-y-3 border-t border-line pt-3">
            <input type="hidden" name="slot" value={slot.slot} />
            <div>
              <h3 className="font-bold">{slot.label}</h3>
              <p className="text-sm text-[#5c6665]">{slot.groupName ? `Đang chọn: ${slot.groupName}` : "Chưa chọn nhóm Zalo."}</p>
            </div>
            <Field label="Nhóm Zalo">
              <select name="groupId" defaultValue={slot.groupId}>
                <option value="">Chưa chọn</option>
                {choices.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                    {group.members ? ` (${group.members})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Btn type="submit">Lưu {slot.label.toLowerCase()}</Btn>
          </form>
        );
      })}
    </div>
  );
}

export function ZaloMessageManager({
  messages,
}: {
  messages: {
    id: string;
    name: string;
    kind: "schedule" | "trigger";
    eventLabel: string;
    enabled: boolean;
    group: ZaloGroupSlot;
    time: string;
    template: string;
    fields: string;
  }[];
}) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <form key={message.id} action={saveZaloMessageAction} className="space-y-3 border-t border-line pt-3">
          <input type="hidden" name="id" value={message.id} />
          <div>
            <h3 className="font-bold">{message.name}</h3>
            <p className="text-xs leading-5 text-[#5c6665]">
              {message.kind === "schedule" ? "Tin tự động, mỗi ngày vào giờ đã chọn." : `Tin theo điều kiện: ${message.eventLabel}.`}
            </p>
          </div>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
            <input type="checkbox" name="enabled" defaultChecked={message.enabled} />
            <span className="text-sm font-semibold">Bật gửi tin này</span>
          </label>
          <Field label="Gửi vào nhóm">
            <select name="group" defaultValue={message.group}>
              <option value="reception">Nhóm lễ tân</option>
              <option value="booking">Nhóm booking</option>
            </select>
          </Field>
          {message.kind === "schedule" ? (
            <Field label="Giờ gửi hằng ngày">
              <input type="time" name="time" defaultValue={message.time} required />
            </Field>
          ) : null}
          <Field label="Mẫu tin">
            <textarea name="template" rows={5} defaultValue={message.template} />
          </Field>
          <p className="text-xs text-[#5c6665]">Chỗ điền: {message.fields}</p>
          <div className="flex flex-wrap gap-2">
            <Btn type="submit">Lưu tin</Btn>
          </div>
        </form>
      ))}
      {messages.map((message) => (
        <form key={`${message.id}-test`} action={sendZaloMessageTestAction}>
          <input type="hidden" name="id" value={message.id} />
          <Btn type="submit" variant="ghost">
            Gửi thử {message.name.toLowerCase()}
          </Btn>
        </form>
      ))}
    </div>
  );
}

export function ZaloTestSend({
  connected,
  groups: savedGroups,
}: {
  connected: boolean;
  groups: { slot: ZaloGroupSlot; label: string; groupId: string; groupName: string }[];
}) {
  const [groups, setGroups] = useState<{ id: string; name: string; members: number }[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const saved = savedGroups.filter((group) => group.groupId);
  const options = groups ? [...groups] : [];
  for (const group of saved) {
    if (!options.some((item) => item.id === group.groupId)) {
      options.push({ id: group.groupId, name: `${group.label}: ${group.groupName || group.groupId}`, members: 0 });
    }
  }

  async function load() {
    setPending(true);
    setError("");
    const result = await listZaloGroupsAction();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGroups(result.groups);
  }

  return (
    <div className="space-y-3">
      <Btn type="button" variant="ghost" onClick={load} disabled={!connected || pending}>
        {pending ? "Đang tải nhóm..." : "Tải nhóm để chọn chỗ gửi"}
      </Btn>
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      <form action={sendZaloTestAction} className="space-y-3">
        <Field label="Nhóm nhận tin thử">
          <select name="groupId" defaultValue={options[0]?.id || ""} disabled={!connected}>
            <option value="">Chưa chọn</option>
            {options.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {group.members ? ` (${group.members})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nội dung">
          <textarea name="message" rows={3} defaultValue="Đây là tin thử. Nếu nhóm nhận được dòng này thì đường gửi Zalo đang chạy." />
        </Field>
        <Btn type="submit" disabled={!connected}>
          Gửi thử
        </Btn>
      </form>
      {!connected ? <p className="text-sm text-[#5c6665]">Kết nối Zalo trước khi gửi thử.</p> : null}
    </div>
  );
}
