# Ops Monical

Web vận hành khách sạn (mobile-first / PWA) trên Next.js, sẵn sàng đẩy Cloudflare Workers qua OpenNext.

**Không thay thế ezCloudhotel PMS.** Ops không gọi API ezCloud. Booking/tiền phòng vẫn trên PMS. Agent (sau này) crawl ezCloud rồi `POST /api/ingest/pms` để đẩy khách + sơ đồ bán vào Ops.

## Agent đẩy dữ liệu PMS

```bash
# Local: dùng SESSION_SECRET mặc định. PRD: wrangler secret put INGEST_SECRET
curl -sS -X POST http://localhost:3002/api/ingest/pms \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "ezcloud-agent",
    "bookings": [{
      "pmsCode": "EZ-90001",
      "roomNumber": "401",
      "guestName": "Nguyễn Văn A",
      "status": "arriving",
      "arrivalDate": "2026-09-15",
      "departureDate": "2026-09-17",
      "adults": 2,
      "platform": "booking",
      "source": "booking",
      "rate": 900000
    }]
  }'
```

Mỗi booking upsert theo `pmsCode` vào **Lễ tân** và **Bán phòng**. `platform` / `source` / `channel` map sang nền tảng: `booking` (Booking.com), `agoda`, `traveloka`, `expedia`, `airbnb`, `ezcloud`, `walk_in`, `phone`, `company`, `ota`. Booking tạo tay trên Ops có `origin=ops`; agent gắn `origin=ezcloud`. Không ghi đè ghi chú vận hành nếu agent gửi rỗng.

PRD: `npx wrangler secret put INGEST_SECRET` — không để secret trong `wrangler.jsonc`.

## Chạy local

```bash
cp .env.example .env
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) trên điện thoại (cùng Wi-Fi) hoặc Chrome DevTools chế độ mobile 390px.

Tài khoản demo, mật khẩu `123456`:

| Tài khoản | Vai trò              |
| --------- | -------------------- |
| `ngan`    | Lễ tân ca sáng       |
| `thu`     | Lễ tân ca chiều      |
| `tuyen`   | Lễ tân ca tối        |
| `uyen`    | Buồng phòng          |
| `thuy`    | Buồng phòng          |
| `oanh`    | Bếp                  |
| `quanly`  | Quản lý              |

Lần đầu chạy sẽ tạo `data/ops.db` và seed ca hôm nay, khách P.305 đang đếm 30 phút đăng ký lưu trú, việc khăn tắm, phòng OOO và bàn giao ca trước.

## PWA

Trên Chrome Android / Safari iOS: Mở trang → menu trình duyệt → **Thêm vào màn hình chính**.

Live: https://platform.monicalhoteldalat.com

## Đẩy Cloudflare

1. Tạo D1: `npx wrangler d1 create ops-monical`
2. Dán `database_id` vào `wrangler.jsonc`
3. `npx wrangler d1 execute ops-monical --remote --file=drizzle/0000_init.sql`
4. `cp .env.example .dev.vars` và đặt `SESSION_SECRET` mạnh, `INGEST_SECRET` riêng, `NEXTJS_ENV=production`
5. `npm run deploy` — gắn custom domain `platform.monicalhoteldalat.com` (zone `monicalhoteldalat.com` phải nằm trên cùng tài khoản Cloudflare).

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

P1/P2 (PDF, Zalo OA, kho…) chưa làm — đúng lộ trình spec. Ingest PMS từ agent crawl ezCloud: `POST /api/ingest/pms`.
