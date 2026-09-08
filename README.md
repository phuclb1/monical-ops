# Ops Monical

Web vận hành khách sạn (mobile-first / PWA) trên Next.js, sẵn sàng đẩy Cloudflare Workers qua OpenNext.

**Không thay thế ezCloudhotel PMS.** Booking, check-in, check-out và tiền phòng vẫn nằm trên PMS. Web này lưu nhiệm vụ, checklist, bàn giao, sự cố và bằng chứng công việc. Zalo chỉ để thông báo nhanh.

## Chạy local

```bash
cp .env.example .env
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) trên điện thoại (cùng Wi-Fi) hoặc Chrome DevTools chế độ mobile 390px.

Tài khoản demo, mật khẩu `123456`:

| Tài khoản | Vai trò   |
| --------- | --------- |
| `letan`   | Lễ tân    |
| `hk`      | Buồng phòng |
| `bep`     | Bếp       |
| `tapvu`   | Tạp vụ    |
| `quanly`  | Quản lý   |
| `ketoan`  | Kế toán   |

Lần đầu chạy sẽ tạo `data/ops.db` và seed ca hôm nay, khách P.305 đang đếm 30 phút đăng ký lưu trú, việc khăn tắm, phòng OOO và bàn giao ca trước.

## PWA

Trên Chrome Android / Safari iOS: Mở trang → menu trình duyệt → **Thêm vào màn hình chính**.

Live: https://ops-monical.phuclb1.workers.dev

## Đẩy Cloudflare

1. Tạo D1: `npx wrangler d1 create ops-monical`
2. Dán `database_id` vào `wrangler.jsonc`
3. `npx wrangler d1 execute ops-monical --remote --file=drizzle/0000_init.sql`
4. `cp .env.example .dev.vars` và đặt `SESSION_SECRET` mạnh, `NEXTJS_ENV=production`
5. `npm run deploy`

Lần đầu đăng nhập trên Workers sẽ seed dữ liệu demo nếu bảng `rooms` còn trống.

SQLite local (`data/ops.db`) dùng khi `next dev`. Khi chạy trên Workers, app dùng binding D1 `DB`.

## Phạm vi MVP (P0)

- Đăng nhập / phân quyền
- Ca sáng · chiều · đêm + checklist
- Việc liên bộ phận + lịch sử + tin nhắn Zalo chuẩn
- Trạng thái phòng HK / INS / OOO
- Đồng hồ đăng ký lưu trú 30 phút
- Bàn giao ca tự sinh từ việc tồn
- BM-01, 03, 04, 05, 06, 09, 13, 14, 15
- Thông báo trong web + báo cáo việc chưa xong

P1/P2 (PDF, Zalo OA, API PMS, kho…) chưa làm — đúng lộ trình spec.
