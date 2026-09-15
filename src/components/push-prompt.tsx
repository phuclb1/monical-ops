"use client";

import { useEffect, useState } from "react";
import { Btn } from "./ui";

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

export function PushPrompt() {
  const [status, setStatus] = useState<"hidden" | "need-install" | "off" | "on" | "busy">("hidden");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (ios && !standalone()) {
      setStatus("need-install");
      return;
    }
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => {
        setStatus(sub ? "on" : "off");
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
      const keyRes = await fetch("/api/push");
      const { publicKey } = (await keyRes.json()) as { publicKey?: string };
      if (!publicKey) throw new Error("Thiếu VAPID public key");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(publicKey),
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("Không lưu được thiết bị");
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

  if (status === "hidden") return null;

  return (
    <div className="mx-auto max-w-md px-3 pt-3 md:max-w-none">
      <div className="rounded-2xl border border-line bg-white p-3">
        {status === "need-install" ? (
          <p className="text-sm">
            iPhone: bấm Chia sẻ → <b>Thêm vào Màn hình chính</b>, mở app từ icon, rồi vào Thông báo để bật push.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{status === "on" ? "Đã bật thông báo điện thoại" : "Thông báo điện thoại"}</p>
              <p className="text-xs text-[#5c6665]">Việc mới, khăn, bàn giao — kêu cả khi tắt app (PWA).</p>
            </div>
            {status === "on" ? (
              <Btn type="button" variant="ghost" className="min-h-12 shrink-0 px-4" onClick={disable}>
                Tắt
              </Btn>
            ) : (
              <Btn type="button" className="min-h-12 shrink-0 px-4" onClick={enable} disabled={status === "busy"}>
                Bật
              </Btn>
            )}
          </div>
        )}
        {error ? <p className="mt-1 text-xs text-[#c23b3b]">{error}</p> : null}
      </div>
    </div>
  );
}
