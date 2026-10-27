"use client";

import { useEffect } from "react";
import { fallbackPwaHome } from "@/lib/pwa-recover";

export default function GlobalError() {
  useEffect(() => {
    fallbackPwaHome();
  }, []);

  return (
    <html lang="vi">
      <body style={{ fontFamily: "sans-serif", background: "#f4efe6", color: "#1c2b2a", padding: 32 }}>
        <h1>Ứng dụng cần tải lại</h1>
        <p>Đang mở trang chủ.</p>
        <a href="/">Về trang chủ</a>
      </body>
    </html>
  );
}
