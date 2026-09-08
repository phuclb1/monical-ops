"use client";

import { useEffect, useState } from "react";
import { Chip } from "./ui";

export function RegistrationTimer({ dueAt, doneAt }: { dueAt?: string | null; doneAt?: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);
  if (doneAt) return <Chip tone="ok">Đã xong đăng ký {new Date(doneAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</Chip>;
  if (!dueAt) return <Chip>Chưa nhận phòng</Chip>;
  const left = Math.round((new Date(dueAt).getTime() - Date.now()) / 60_000);
  if (left <= 0) return <Chip tone="danger">Quá hạn đăng ký {Math.abs(left)} phút</Chip>;
  if (left <= 10) return <Chip tone="warn">Còn {left} phút — cảnh báo vàng</Chip>;
  return <Chip tone="teal">Còn {left} phút / 30 phút</Chip>;
}
