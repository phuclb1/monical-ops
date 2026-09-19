import type { Metadata } from "next";
import Link from "next/link";
import { listNews } from "@/lib/news";
import { HOTEL_NAME } from "@/lib/constants";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Tin tức khách sạn Đà Lạt gần trung tâm",
  description: `Bài viết gợi ý chỗ ở gần Hồ Xuân Hương, chợ đêm và kinh nghiệm đặt phòng tại ${HOTEL_NAME}.`,
  robots: { index: true, follow: true },
  alternates: { canonical: "/tin-tuc" },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(`${iso}T00:00:00+07:00`));
}

export default function NewsIndexPage() {
  const posts = listNews();
  return (
    <article>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-burgundy">Tin tức</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight">Khách sạn Đà Lạt gần trung tâm</h1>
      <p className="mt-3 text-[15px] leading-7 text-[#5c4a46]">
        Gợi ý chỗ ở gần Hồ Xuân Hương, chợ đêm và Quảng trường Lâm Viên — viết cho khách đang so sánh khách sạn Đà Lạt đẹp, đi lại tiện.
      </p>
      <ul className="mt-8 space-y-4">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/tin-tuc/${post.slug}`} className="card block p-4 transition hover:border-burgundy/40">
              <p className="text-xs font-semibold text-[#6b5a52]">{formatDate(post.publishedAt)}</p>
              <h2 className="mt-1 text-xl font-bold leading-snug text-ink">{post.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5c4a46]">{post.excerpt}</p>
              <p className="mt-3 text-sm font-semibold text-burgundy">Đọc bài →</p>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
