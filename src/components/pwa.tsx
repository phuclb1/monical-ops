"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { rememberOpsUser } from "@/lib/pwa-cache";
import { clearPwaHomeFallback, fallbackPwaHome, shouldFallbackPwaHome } from "@/lib/pwa-recover";
import { Btn } from "./ui";

export function PwaBoot() {
  const [install, setInstall] = useState<Event | null>(null);
  const [locked, setLocked] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const userId = document.querySelector("[data-ops-user]")?.getAttribute("data-ops-user");
    rememberOpsUser(userId || null);
    const timer = window.setTimeout(clearPwaHomeFallback, 8000);
    return () => window.clearTimeout(timer);
  }, [path]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onError = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement && target.src.includes("/_next/static/")) {
        fallbackPwaHome();
        return;
      }
      if (event instanceof ErrorEvent && shouldFallbackPwaHome(event.error || event.message)) fallbackPwaHome();
    };
    const onReject = (event: PromiseRejectionEvent) => {
      if (shouldFallbackPwaHome(event.reason)) fallbackPwaHome();
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onReject);
    const bootBeacon = () => {
      if (document.querySelector("script[data-cf-beacon]")) return;
      const script = document.createElement("script");
      script.src = "https://static.cloudflareinsights.com/beacon.min.js";
      script.async = true;
      script.dataset.cfBeacon = JSON.stringify({ token: "05bacc66e32843c5af5ae8014545bdff" });
      document.body.appendChild(script);
    };
    if (document.readyState === "complete") bootBeacon();
    else window.addEventListener("load", bootBeacon, { once: true });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const tick = window.setInterval(() => {
      if (Date.now() - last > 10 * 60 * 1000) setLocked(true);
    }, 10_000);
    ["pointerdown", "keydown", "touchstart"].forEach((n) => window.addEventListener(n, bump));
    // iOS only applies :active if a touchstart listener exists on document/body.
    document.addEventListener("touchstart", () => {}, { passive: true });
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.clearInterval(tick);
    };
  }, []);

  async function doInstall() {
    const ev = install as unknown as { prompt: () => Promise<void> };
    await ev.prompt();
    setInstall(null);
  }

  return (
    <>
      {install ? (
        <div className="pwa-install mx-auto max-w-md px-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
          <div className="card flex items-center justify-between gap-2 p-2">
            <p className="text-xs font-medium">Cài {APP_NAME} lên màn hình chính</p>
            <Btn className="min-h-9 px-3 text-xs" onClick={doInstall}>
              Cài
            </Btn>
          </div>
        </div>
      ) : null}
      {locked ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:items-center md:justify-center">
          <div className="card w-full p-4 md:max-w-sm">
            <h3 className="text-lg font-bold">Màn hình đã khóa</h3>
            <p className="mt-1 text-sm text-[#5c6665]">Không thao tác trong 10 phút. Mở lại để tiếp tục ca.</p>
            <Btn className="mt-3 w-full" onClick={() => setLocked(false)}>
              Mở khóa
            </Btn>
          </div>
        </div>
      ) : null}
    </>
  );
}
