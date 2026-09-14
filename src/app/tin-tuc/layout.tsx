import type { Metadata } from "next";
import { NewsShell } from "@/components/news-shell";
import { HOTEL_NAME } from "@/lib/constants";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: `Tin tức | ${HOTEL_NAME}`,
    template: `%s | ${HOTEL_NAME}`,
  },
  description: `Gợi ý khách sạn Đà Lạt gần trung tâm, kinh nghiệm đặt phòng và tin từ ${HOTEL_NAME}.`,
  robots: { index: true, follow: true },
  openGraph: {
    locale: "vi_VN",
    siteName: HOTEL_NAME,
    type: "website",
  },
};

export default function NewsLayout({ children }: { children: ReactNode }) {
  return <NewsShell>{children}</NewsShell>;
}
