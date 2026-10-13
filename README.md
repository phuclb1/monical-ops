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

## Open API + webhook Codex

Cấu hình tại **Cài đặt → Cấu hình**: bấm **Tạo API token**, sao chép token, dán URL webhook Codex. Agent gọi Open API bằng `Authorization: Bearer <token>`. Token lưu trong `app_settings`, không để trong wrangler.

Nếu chưa tạo token trên web, local vẫn fallback `OPEN_API_SECRET` / `INGEST_SECRET`.

Spec implement cho Codex: [`docs/codex-ezcloud-agent.md`](docs/codex-ezcloud-agent.md).

Agent trên máy local poll mỗi 2 phút — lần sau dùng `polledAt` làm `since`:

```bash
curl -sS "https://platform.monicalhoteldalat.com/api/open/bookings?since=2026-10-12T07:50:00.000Z" \
  -H "Authorization: Bearer $OPEN_API_TOKEN"
```

```bash
# Tạo booking
curl -sS -X POST http://localhost:3000/api/open/bookings \
  -H "Authorization: Bearer $OPEN_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "guestName": "Nguyễn Văn A",
    "guestPhone": "0901234567",
    "source": "walk_in",
    "checkIn": "2026-10-15",
    "checkOut": "2026-10-17",
    "rooms": [{ "roomNumber": "401", "rate": 900000, "adults": 2 }]
  }'

# Lấy booking theo id hoặc mã PMS
curl -sS http://localhost:3000/api/open/bookings/BK-10-12 \
  -H "Authorization: Bearer $OPEN_API_SECRET"
curl -sS "http://localhost:3000/api/open/bookings?pmsCode=BK-10-12" \
  -H "Authorization: Bearer $OPEN_API_SECRET"
```

Khi lễ tân / quản lý **tạo booking**, **đổi phòng**, **thêm ngày** hoặc **thêm phòng** trên Ops, worker POST JSON tới URL webhook đã lưu. Booking tạo từ Open API / ingest không gửi lại (tránh vòng).

Payload webhook: `{ event, events, at, actor, bookingId, pmsCode, changes, booking }`. `event` là `booking.created` | `booking.room_changed` | `booking.dates_changed` | `booking.rooms_added`. Nếu có secret, header `X-Ops-Signature: sha256=HMAC(timestamp.body)` và `X-Ops-Timestamp`.

## SePay báo tiền vào nhóm kế toán

SePay gửi HTTP POST tới URL nền tảng `https://platform.monicalhoteldalat.com/api/webhooks/sepay` mỗi khi có giao dịch. Cùng URL hiện ở **Cài đặt → Zalo**. Worker nhận webhook, bỏ qua tiền ra, chống gửi trùng theo `id`, rồi nhắn Zalo vào nhóm kế toán.

Trên SePay: Webhooks → Thêm webhook, dán URL nền tảng đó. Loại giao dịch chọn **Chỉ tiền vào** hoặc **Tất cả**. Phương thức xác thực dùng **HMAC-SHA256** (khuyến nghị) hoặc **API Key**.

```bash
npx wrangler secret put SEPAY_WEBHOOK_SECRET
# hoặc, nếu webhook dùng API Key:
npx wrangler secret put SEPAY_API_KEY
```

Staging dùng cùng lệnh với `--env staging`. Production từ chối webhook chưa có secret. Local (`npm run dev`) nhận payload không chữ ký để thử.

Trong **Cài đặt → Zalo → Nhóm**, chọn nhóm kế toán. Tab **Tin** có mẫu "Tiền vào tài khoản"; bật tin và gán đúng nhóm đó. Mẫu dùng `{{nganHang}} {{soTk}} {{soTien}} {{noiDung}} {{luc}} {{soDu}} {{maGd}}`.

## Email khôi phục mật khẩu

Ứng dụng gửi liên kết đặt lại mật khẩu qua Resend. Cấu hình production:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put PASSWORD_RESET_FROM
```

`PASSWORD_RESET_FROM` phải là địa chỉ trên domain đã xác minh với Resend, ví dụ `Monical Quản lý vận hành <no-reply@monicalhoteldalat.com>`.
Mỗi tài khoản cần có email riêng; quản lý cập nhật tại **Nhân viên → tài khoản**. Liên kết chỉ dùng một lần, hết hạn sau 30 phút.

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
| `chusohuu` | Chủ sở hữu (chỉ xem doanh thu / khách) |

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

P1/P2 (PDF, Zalo OA, kho…) chưa làm — đúng lộ trình spec. Ingest PMS từ agent crawl ezCloud: `POST /api/ingest/pms`. Open API + webhook Codex: `POST /api/open/bookings`.
