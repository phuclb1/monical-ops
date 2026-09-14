import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { HOTEL_NAME } from "@/lib/constants";
import { getNews, listNews, type NewsPost } from "@/lib/news";
import { absoluteUrl } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return listNews().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getNews(slug);
  if (!post) return {};
  const url = `/tin-tuc/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      locale: "vi_VN",
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      images: [{ url: "/logo.png", alt: HOTEL_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(`${iso}T00:00:00+07:00`));
}

function jsonLd(post: NewsPost) {
  const url = absoluteUrl(`/tin-tuc/${post.slug}`);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      inLanguage: "vi-VN",
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: HOTEL_NAME },
      publisher: {
        "@type": "Organization",
        name: HOTEL_NAME,
        logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: post.title,
      itemListElement: post.hotels.map((hotel) => ({
        "@type": "ListItem",
        position: hotel.rank,
        name: hotel.name,
        description: hotel.highlight,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "Hotel",
      name: HOTEL_NAME,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Đà Lạt",
        addressRegion: "Lâm Đồng",
        addressCountry: "VN",
      },
    },
  ];
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getNews(slug);
  if (!post) notFound();
  const featured = post.hotels.find((hotel) => hotel.featured) ?? post.hotels[0];

  return (
    <article className="news-article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(post)) }} />
      <nav className="text-sm text-[#6b5a52]">
        <Link href="/tin-tuc" className="font-semibold text-burgundy">
          Tin tức
        </Link>
        <span className="px-1">/</span>
        <span>Top 5 khách sạn</span>
      </nav>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-burgundy">Đà Lạt · 2026</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">{post.title}</h1>
      <p className="mt-3 text-sm text-[#6b5a52]">Cập nhật {formatDate(post.updatedAt)}</p>
      <p className="mt-5 text-[17px] leading-8 text-[#3a2a28]">{post.excerpt}</p>

      <ol className="toc mt-6 grid gap-2 sm:grid-cols-2">
        {post.hotels.map((hotel) => (
          <li key={hotel.slug}>
            <a
              href={`#${hotel.slug}`}
              className={`card flex min-h-11 items-center gap-3 p-3 text-sm font-semibold ${hotel.featured ? "border-burgundy/40 bg-[#f8efe4]" : ""}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-burgundy text-xs text-cream">
                {hotel.rank}
              </span>
              <span>{hotel.name}</span>
            </a>
          </li>
        ))}
      </ol>

      <h2>Vì sao nên ở gần trung tâm Đà Lạt?</h2>
      <p>
        Trung tâm Đà Lạt gom Hồ Xuân Hương, chợ đêm, Quảng trường Lâm Viên và phần lớn quán ăn, cà phê mà khách hay tìm. Ở gần đây, bạn đi bộ hoặc chạy xe vài phút thay vì mất 20–30 phút từ hồ Tuyền Lâm mỗi tối. Bài này chọn{" "}
        <strong>5 khách sạn Đà Lạt gần trung tâm</strong> theo vị trí, phong cách và mức tiện nghi — không phải bảng giá cố định, vì giá lễ Tết thay đổi nhanh.
      </p>
      <p>
        Tiêu chí: đi tới hồ / chợ trong bán kính trung tâm, phòng và dịch vụ đủ dùng cho kỳ nghỉ 2–4 đêm, và có lựa chọn cho cặp đôi lẫn gia đình.{" "}
        <strong>{HOTEL_NAME}</strong> đứng đầu danh sách vì dải phòng rộng và vị trí đi phố tiện, không cần resort xa.
      </p>

      <h2>Top 5 khách sạn gần trung tâm Đà Lạt</h2>

      {post.hotels.map((hotel) => (
        <section key={hotel.slug} id={hotel.slug} className={hotel.featured ? "featured-hotel" : undefined}>
          <h3>
            {hotel.rank}. {hotel.name}
          </h3>
          <p className="hotel-kicker">{hotel.highlight}</p>
          {hotel.featured ? (
            <div className="featured-panel">
              <div className="overflow-hidden rounded-xl bg-burgundy">
                <Logo className="mx-auto h-40 w-auto object-contain" />
              </div>
              <p>
                <strong>{HOTEL_NAME}</strong> là lựa chọn boutique ngay khu trung tâm: gần phố, gần điểm ăn uống, phù hợp khách không muốn mỗi buổi tối phải tính quãng đường về resort. Khách sạn có đủ hạng từ phòng 2 người (Standard, Twin, Superior, Deluxe) đến Family, Triple, Senior, VIP và dorm — nhóm bạn có thể ở cùng tòa mà không phải tách chỗ.
              </p>
            </div>
          ) : null}
          <ul>
            {hotel.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <dl className="hotel-meta">
            <div>
              <dt>Khu vực</dt>
              <dd>{hotel.area}</dd>
            </div>
            {hotel.address ? (
              <div>
                <dt>Địa chỉ</dt>
                <dd>{hotel.address}</dd>
              </div>
            ) : null}
            {hotel.priceFrom ? (
              <div>
                <dt>Giá tham khảo</dt>
                <dd>{hotel.priceFrom}</dd>
              </div>
            ) : null}
            {hotel.rating ? (
              <div>
                <dt>Đánh giá</dt>
                <dd>{hotel.rating}</dd>
              </div>
            ) : null}
          </dl>
          {hotel.website ? (
            <p>
              <a href={hotel.website} rel="nofollow noopener noreferrer" target="_blank">
                Website {hotel.name}
              </a>
            </p>
          ) : null}
        </section>
      ))}

      <h2>Cách chọn cho đúng nhu cầu</h2>
      <ul>
        <li>
          <strong>Cặp đôi, đi phố nhiều:</strong> {featured.name} hoặc Hotel Colline.
        </li>
        <li>
          <strong>Gia đình, cần phòng lớn:</strong> {featured.name} (Family / Triple) hoặc Nesta Valley.
        </li>
        <li>
          <strong>Thích không gian di sản, view hồ:</strong> Dalat Palace Heritage.
        </li>
        <li>
          <strong>Muốn 5 sao, hồ bơi, ở trong khách sạn cả ngày:</strong> MerPerle.
        </li>
      </ul>

      <h2>Kinh nghiệm đặt phòng khách sạn trung tâm Đà Lạt</h2>
      <ul>
        <li>Cuối tuần và lễ, phòng view và Family hết trước. Đặt sớm hơn ngày thường ít nhất 2–4 tuần.</li>
        <li>Hỏi rõ hướng phòng: city view / mountain view khác nhau rõ vào buổi sáng sương.</li>
        <li>Nếu có xe hơi, xác nhận chỗ đậu trước — mặt tiền trung tâm thường chật.</li>
        <li>Giá trên OTA và giá trực tiếp có thể lệch; với {HOTEL_NAME} nên hỏi lễ tân cùng ngày bạn cần ở.</li>
      </ul>

      <h2>Câu hỏi thường gặp</h2>
      {post.faqs.map((faq) => (
        <section key={faq.q}>
          <h3>{faq.q}</h3>
          <p>{faq.a}</p>
        </section>
      ))}

      <p>
        Tóm lại, nếu bạn cần <strong>khách sạn Đà Lạt gần trung tâm</strong> để đi hồ, chợ đêm và quán xá trong phố, năm cái tên trên đều đáng xem.{" "}
        <strong>{HOTEL_NAME}</strong> phù hợp khách muốn ở gần phố, có nhiều hạng phòng, và không phải đi xa mỗi tối.
      </p>
    </article>
  );
}
