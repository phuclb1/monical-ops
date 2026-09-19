"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BOARD_TTL_MS, rememberOpsUser, writeSnapshot } from "@/lib/pwa-cache";

export function BoardCache({
  userId,
  board,
  payload,
}: {
  userId: string;
  board: keyof typeof BOARD_TTL_MS;
  payload: unknown;
}) {
  const router = useRouter();

  useEffect(() => {
    rememberOpsUser(userId);
    writeSnapshot(userId, board, payload);
  }, [userId, board, payload]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const onOnline = () => router.refresh();
    window.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
