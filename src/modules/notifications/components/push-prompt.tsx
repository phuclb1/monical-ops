"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Smartphone } from "lucide-react";
import { Btn } from "@/components/ui";

function vapidBytes(base64Url: string) {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + pad).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function standalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

async function persistSubscription() {
  const keyRes = await fetch("/api/push");
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) throw new Error("Thiếu VAPID public key");
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidBytes(publicKey),
    }));
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error("Không lưu được thiết bị");
}

export function PushPrompt({ variant = "banner" }: { variant?: "banner" | "panel" }) {
  const path = usePathname();
  const [status, setStatus] = useState<"hidden" | "need-install" | "off" | "on" | "busy" | "unsupported">("hidden");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (ios && !standalone()) {
      setStatus("need-install");
      return;
    }
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then(async (sub) => {
          if (sub) {
            await fetch("/api/push", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(sub.toJSON()),
            }).catch(() => {});
            setStatus("on");
            return;
          }
          try {
            await persistSubscription();
            setStatus("on");
          } catch {
            setStatus("off");
          }
        });
      return;
    }
    setStatus("off");
  }, []);

  async function enable() {
    setError("");
    setStatus("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("off");
        setError("Chưa cho phép thông báo trên điện thoại.");
        return;
      }
      await persistSubscription();
      setStatus("on");
    } catch (e) {
      setStatus("off");
      setError((e as Error).message || "Không bật được thông báo");
    }
  }

  async function disable() {
    setError("");
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub?.endpoint }),
      });
      await sub?.unsubscribe();
      setStatus("off");
    } catch (e) {
      setStatus("on");
      setError((e as Error).message);
    }
  }

  if (status === "hidden" && variant !== "panel") return null;
  if (variant === "banner" && (path === "/notifications" || status === "on" || status === "unsupported")) return null;

  const copy =
    status === "need-install"
      ? "iPhone: Chia sẻ → Thêm vào Màn hình chính, mở từ icon, rồi bật thông báo đẩy."
      : status === "unsupported"
        ? "Cài PWA trên điện thoại (Thêm vào Màn hình chính), mở từ icon, rồi bật thông báo để kêu khi có đặt / sửa / hủy booking."
        : "Đặt, sửa, hủy booking kêu trên điện thoại — kể cả khi tắt app.";

  if (variant === "panel") {
    return (
      <div className="rounded-2xl border border-line bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f7edd2] text-burgundy">
            <Smartphone size={18} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {status === "on" ? "Đã bật thông báo đẩy" : status === "unsupported" ? "Thông báo đẩy trên điện thoại" : "Thông báo đẩy · PWA"}
            </p>
            <p className="mt-0.5 text-sm leading-5 text-[#5c6665]">{copy}</p>
            {error ? <p className="mt-1 text-xs text-[#c23b3b]">{error}</p> : null}
          </div>
          {status === "hidden" || status === "need-install" || status === "unsupported" ? null : status === "on" ? (
            <Btn type="button" variant="ghost" className="min-h-11 shrink-0 px-3 text-xs" onClick={disable}>
              Tắt
            </Btn>
          ) : (
            <Btn type="button" className="min-h-11 shrink-0 px-4" onClick={enable} disabled={status === "busy"}>
              Bật
            </Btn>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-3 pt-3 md:max-w-none">
      <div className="rounded-2xl border border-line bg-white p-3">
        {status === "need-install" ? (
          <p className="text-sm leading-5">{copy}</p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Thông báo đẩy · PWA</p>
              <p className="text-xs text-[#5c6665]">{copy}</p>
            </div>
            <Btn type="button" className="min-h-12 shrink-0 px-4" onClick={enable} disabled={status === "busy"}>
              Bật
            </Btn>
          </div>
        )}
        {error ? <p className="mt-1 text-xs text-[#c23b3b]">{error}</p> : null}
      </div>
    </div>
  );
}
