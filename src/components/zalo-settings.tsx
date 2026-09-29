"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { listZaloGroupsAction, saveZaloGroupAction } from "@/actions/zalo";
import { Btn, Field } from "@/components/ui";

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

export function ZaloGroupPicker({ currentId, currentName }: { currentId: string; currentName: string }) {
  const [groups, setGroups] = useState<{ id: string; name: string; members: number }[] | null>(null);
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
    setGroups(result.groups);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">Nhóm đang chọn: {currentName || "Chưa chọn"}</p>
      <Btn type="button" variant="ghost" onClick={load} disabled={pending}>
        {pending ? "Đang tải nhóm..." : "Tải danh sách nhóm"}
      </Btn>
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      {groups ? (
        groups.length === 0 ? (
          <p className="text-sm text-[#5c6665]">Tài khoản này chưa có nhóm nào.</p>
        ) : (
          <form action={saveZaloGroupAction} className="space-y-3">
            <Field label="Nhóm nhận tin việc">
              <select name="groupId" defaultValue={currentId || groups[0]?.id}>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.members})
                  </option>
                ))}
              </select>
            </Field>
            <Btn type="submit">Lưu nhóm</Btn>
          </form>
        )
      ) : null}
    </div>
  );
}
