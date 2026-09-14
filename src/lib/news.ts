import { HOTEL_NAME } from "./constants";

export type NewsHotel = {
  rank: number;
  name: string;
  slug: string;
  highlight: string;
  area: string;
  address?: string;
  priceFrom?: string;
  rating?: string;
  website?: string;
  featured?: boolean;
  points: string[];
};

export type NewsFaq = { q: string; a: string };

export type NewsPost = {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  keywords: string[];
  hotels: NewsHotel[];
  faqs: NewsFaq[];
};

export const NEWS_POSTS: NewsPost[] = [
  {
    slug: "top-5-khach-san-da-lat-gan-trung-tam",
    title: "Top 5 khách sạn gần trung tâm Đà Lạt đẹp và đáng ở nhất",
    description:
      "Gợi ý 5 khách sạn Đà Lạt gần Hồ Xuân Hương và chợ đêm, dễ đi bộ khám phá phố núi. MONICAL hotel dalat nằm trong top 5 nhờ vị trí trung tâm và nhiều hạng phòng.",
    excerpt:
      "Chọn khách sạn gần trung tâm Đà Lạt giúp tiết kiệm di chuyển khi đi chợ đêm, hồ Xuân Hương và Quảng trường Lâm Viên. Đây là 5 lựa chọn đáng cân nhắc, trong đó có MONICAL hotel dalat.",
    publishedAt: "2026-09-09",
    updatedAt: "2026-09-09",
    keywords: [
      "khách sạn Đà Lạt gần trung tâm",
      "khách sạn Đà Lạt đẹp",
      "top 5 khách sạn Đà Lạt",
      "MONICAL hotel dalat",
      "khách sạn gần chợ đêm Đà Lạt",
      "khách sạn gần Hồ Xuân Hương",
    ],
    hotels: [
      {
        rank: 1,
        name: HOTEL_NAME,
        slug: "monical-hotel-dalat",
        highlight: "Khách sạn boutique trung tâm, nhiều hạng phòng cho cặp đôi, gia đình và nhóm bạn",
        area: "Trung tâm Đà Lạt",
        featured: true,
        points: [
          "Nằm khu trung tâm, thuận tiện đi bộ hoặc chạy xe vài phút ra Hồ Xuân Hương, chợ đêm và Quảng trường Lâm Viên.",
          "Dải phòng rộng: Standard, Superior, Deluxe (có lựa chọn view), Family, Twin, Triple, Senior, VIP và dorm — phù hợp đi hai người, gia đình hoặc nhóm.",
          "Phong cách ấm, tông burgundy đặc trưng; lễ tân và buồng phòng vận hành theo checklist ca nên phòng giao khách gọn, đúng giờ.",
          "Phù hợp khách muốn ở gần phố, ăn uống tiện, không phải đi xa mỗi tối.",
        ],
      },
      {
        rank: 2,
        name: "Hotel Colline",
        slug: "hotel-colline",
        highlight: "Kiến trúc khối hiện đại, sát khu chợ và Đà Lạt Center",
        area: "Phan Bội Châu, sát chợ Đà Lạt",
        address: "10 Phan Bội Châu, Xuân Hương — Đà Lạt",
        priceFrom: "khoảng 1.400.000đ/đêm",
        rating: "4.4/5 trên Google",
        website: "https://hotelcolline.com",
        points: [
          "Ưu thế lớn nhất là khoảng cách: bước ra là khu chợ, quán ăn đêm và Đà Lạt Center.",
          "Phù hợp khách thích dạo phố, ăn vặt buổi tối, không muốn phụ thuộc xe ôm hay taxi.",
          "Giá và không khí nghiêng về phân khúc 4 sao hiện đại, đông khách vào cuối tuần.",
        ],
      },
      {
        rank: 3,
        name: "Dalat Palace Heritage Hotel",
        slug: "dalat-palace-heritage",
        highlight: "Khách sạn di sản nhìn ra Hồ Xuân Hương",
        area: "Trần Phú, sát hồ Xuân Hương",
        address: "2 Trần Phú, Xuân Hương — Đà Lạt",
        priceFrom: "khoảng 2.000.000đ/đêm",
        rating: "4.4/5 trên Google",
        website: "https://dalatpalacehotel.com",
        points: [
          "Công trình thời Pháp, khuôn viên rộng, nội thất cổ điển — hợp khách thích không gian lịch sử.",
          "Vị trí nhìn hồ, đi dạo quanh Hồ Xuân Hương rất gần.",
          "Giá cao hơn các khách sạn boutique trung tâm; đặt sớm vào lễ Tết.",
        ],
      },
      {
        rank: 4,
        name: "Nesta Valley Đà Lạt",
        slug: "nesta-valley-da-lat",
        highlight: "4 sao trên đường Bùi Thị Xuân, gần sân golf và chợ",
        area: "Bùi Thị Xuân, cách chợ khoảng 750m",
        address: "94 Bùi Thị Xuân, Xuân Hương — Đà Lạt",
        priceFrom: "khoảng 1.100.000đ/đêm",
        rating: "4.4/5 trên Google",
        website: "https://nestahotel.com.vn/",
        points: [
          "Cách chợ Đà Lạt khoảng 750m, yên hơn mặt tiền chợ nhưng vẫn đi lại nhanh.",
          "Có spa, gym, sauna — hợp khách muốn nghỉ trong khách sạn thêm nửa ngày.",
          "Nhiều hạng phòng có ban công; giá thường mềm hơn các 5 sao trung tâm.",
        ],
      },
      {
        rank: 5,
        name: "MerPerle Dalat Hotel",
        slug: "merperle-dalat-hotel",
        highlight: "Khách sạn 5 sao quy mô lớn, dịch vụ nghỉ dưỡng đầy đủ",
        area: "Hùng Vương, phía trung tâm mở rộng",
        address: "1 Hùng Vương, Xuân Hương — Đà Lạt",
        priceFrom: "khoảng 1.400.000đ/đêm",
        rating: "4.9/5 trên Google",
        website: "https://merperledalat.vn/",
        points: [
          "Đẳng cấp 5 sao, hồ bơi bốn mùa và nhà hàng trong khuôn viên.",
          "Hợp khách muốn tiện nghi resort nhưng không ra hồ Tuyền Lâm.",
          "Quy mô lớn, phù hợp đoàn, hội nghị; không khí khác khách sạn boutique nhỏ.",
        ],
      },
    ],
    faqs: [
      {
        q: "Ở Đà Lạt nên chọn khách sạn gần trung tâm hay hồ Tuyền Lâm?",
        a: "Nếu thích đi chợ đêm, cà phê phố và di chuyển ngắn thì chọn trung tâm (Phường 1, khu hồ Xuân Hương). Hồ Tuyền Lâm hợp nghỉ dưỡng, cần xe riêng. MONICAL hotel dalat nằm nhóm trung tâm.",
      },
      {
        q: "Khách sạn nào trong top 5 gần chợ đêm nhất?",
        a: "Hotel Colline sát khu chợ nhất. MONICAL hotel dalat và Nesta Valley cũng trong bán kính đi bộ hoặc chạy xe vài phút. Dalat Palace sát hồ hơn là sát chợ.",
      },
      {
        q: "Đi Đà Lạt mùa cao điểm nên đặt phòng trước bao lâu?",
        a: "Lễ 30/4, 2/9, Noel, Tết và Festival Hoa nên đặt trước 4–8 tuần. Cuối tuần thường hết phòng view đẹp sớm hơn ngày thường.",
      },
      {
        q: "MONICAL hotel dalat phù hợp với ai?",
        a: "Cặp đôi, gia đình và nhóm bạn cần ở gần phố, có nhiều hạng từ phòng 2 người đến Family, Triple và dorm. Không phải resort hồ Tuyền Lâm — thế mạnh là vị trí trung tâm và vận hành gọn.",
      },
    ],
  },
];

export function listNews() {
  return NEWS_POSTS;
}

export function getNews(slug: string) {
  return NEWS_POSTS.find((post) => post.slug === slug);
}
