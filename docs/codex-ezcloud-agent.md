# Codex agent: sync booking Ops → ezCloudhotel

Spec để implement agent chạy **trên máy local**. Ops không gọi ezCloud. Agent chủ động gọi Open API mỗi **2 phút**, rồi tạo / sửa booking trên ezCloudhotel.

Hotel: **MONICAL hotel dalat**. PMS: **ezCloudhotel**. Ops live: `https://platform.monicalhoteldalat.com`.

Không làm webhook. Để trống URL webhook trong Cài đặt. Không crawl ezCloud trong agent này — chiều ezCloud → Ops đã có `POST /api/ingest/pms`.

---

## Việc cần làm

1. Poll Open API mỗi 120 giây.
2. Chỉ lấy booking `origin=ops` (tạo / sửa trên Ops).
3. Sync sang ezCloudhotel:
   - booking mới → tạo reservation trên ezCloud
   - đổi `roomNumber` → đổi phòng
   - đổi `checkIn` / `checkOut` → sửa ngày (thêm / bớt đêm)
   - thêm phòng trong cùng `id` → thêm room stay
4. Ghi state local để không tạo trùng.
5. Không đẩy booking `origin=ezcloud` ngược lại ezCloud.

---

## Auth

Token lấy ở Ops: **Cài đặt → Cấu hình → Tạo API token**. Dạng `ops_` + 64 hex.

```
Authorization: Bearer ops_...
```

Hoặc header `X-Open-Api-Secret: ops_...`.

401 = sai token. 503 = chưa tạo token trên Ops.

Lưu token ở env local `OPS_OPEN_API_TOKEN`. Không commit token.

```
OPS_BASE_URL=https://platform.monicalhoteldalat.com
OPS_OPEN_API_TOKEN=ops_...
POLL_MS=120000
```

---

## API

Base: `{OPS_BASE_URL}/api/open/bookings`

### 1. Poll booking mới / vừa sửa

```
GET /api/open/bookings?origin=ops&since={polledAt lần trước}&limit=50
```

Lần đầu **bỏ** `since` (lấy booking đang `reserved` / `inhouse`).

Response:

```json
{
  "ok": true,
  "count": 1,
  "polledAt": "2026-10-12T08:00:00.000Z",
  "bookings": [
    {
      "id": "abc123",
      "pmsCode": "BK-10-12",
      "guestName": "Nguyễn Văn A",
      "guestPhone": "0901234567",
      "origin": "ops",
      "source": "walk_in",
      "status": "reserved",
      "checkIn": "2026-10-15",
      "checkOut": "2026-10-17",
      "nights": 2,
      "adults": 2,
      "children": 0,
      "notes": null,
      "total": 1800000,
      "deposit": 500000,
      "createdAt": "2026-10-12T07:40:00.000Z",
      "updatedAt": "2026-10-12T07:51:00.000Z",
      "rooms": [
        {
          "saleId": "s-1",
          "roomId": "r-401",
          "roomNumber": "401",
          "roomType": "DELUXE",
          "status": "reserved",
          "checkIn": "2026-10-15",
          "checkOut": "2026-10-17",
          "rate": 900000,
          "adults": 2,
          "children": 0,
          "breakfast": true
        }
      ]
    }
  ]
}
```

Luôn lưu `polledAt` và dùng làm `since` lần sau. Chỉ booking có `createdAt` hoặc `updatedAt` **> since** mới về.

Query khác (khi cần):

| Query | Ý nghĩa |
| --- | --- |
| `since` | ISO / `YYYY-MM-DD` / unix. Lọc mới hoặc vừa sửa |
| `origin=ops` | Chỉ booking tạo trên Ops |
| `status=active` | Mặc định: `reserved` + `inhouse` |
| `status=all` | Mọi trạng thái |
| `id=` / `pmsCode=` | Lấy đúng 1 booking |
| `from` / `to` | Lọc theo khoảng ngày ở (`YYYY-MM-DD`) |
| `limit` | 1–200, mặc định 50 |

### 2. Lấy một booking

```
GET /api/open/bookings/{id}
GET /api/open/bookings?pmsCode=BK-10-12
GET /api/open/bookings?id=abc123
```

`{id}` là Ops `booking.id` hoặc mã `pmsCode` (`BK-10-12`). 404 nếu không có.

```json
{ "ok": true, "booking": { "...": "..." } }
```

### 3. Tạo booking trên Ops (chiều ngược, chỉ khi cần)

Không dùng cho sync Ops → ezCloud. Chỉ dùng nếu agent phải ghi booking vào Ops.

```
POST /api/open/bookings
Content-Type: application/json
```

```json
{
  "guestName": "Nguyễn Văn A",
  "guestPhone": "0901234567",
  "source": "walk_in",
  "origin": "ops",
  "checkIn": "2026-10-15",
  "checkOut": "2026-10-17",
  "rooms": [{ "roomNumber": "401", "rate": 900000, "adults": 2, "breakfast": true }],
  "pmsCode": "EZ-90001",
  "notes": "",
  "deposit": 0
}
```

Alias: `arrivalDate` / `departureDate`, `roomNumber` (một phòng). Số phòng `"P.401"` = `"401"`. 201 + `{ ok, booking }`. 400 + `{ ok: false, error }` nếu thiếu tên / phòng / trùng lịch.

`source`: `walk_in` `phone` `zalo` `facebook` `tiktok` `company` `ezcloud` `booking` `agoda` `traveloka` `expedia` `airbnb` `ota`.

---

## Vòng poll (bắt buộc)

```
state.since = ""
mỗi 120 giây:
  url = GET /api/open/bookings?origin=ops&limit=50
        + (&since=state.since nếu đã có)
  data = JSON
  nếu !data.ok → log, giữ since cũ, retry lần sau
  với mỗi booking trong data.bookings:
    syncEzCloud(booking)
  state.since = data.polledAt
  ghi state ra đĩa
```

Timeout HTTP 20s. Không chạy 2 poll chồng nhau. Lỗi một booking thì log và tiếp booking sau — không rollback `since` nếu các booking khác đã sync xong; nếu muốn an toàn hơn, chỉ cập nhật `since` khi **cả batch** thành công.

Lần đầu không có `since`: sync toàn bộ booking Ops đang active, rồi mới bắt đầu incremental.

---

## State local (bắt buộc)

File `data/ops-ezcloud-sync.json` (hoặc tương đương):

```json
{
  "since": "2026-10-12T08:00:00.000Z",
  "bookings": {
    "abc123": {
      "opsId": "abc123",
      "opsPmsCode": "BK-10-12",
      "ezcloudCode": "EZ-12345",
      "updatedAt": "2026-10-12T07:51:00.000Z",
      "rooms": {
        "s-1": { "roomNumber": "401", "checkIn": "2026-10-15", "checkOut": "2026-10-17" }
      }
    }
  }
}
```

Khóa theo `booking.id` (ổn định). `pmsCode` Ops (`BK-…`) chỉ để ghi chú trên ezCloud, **không** phải mã ezCloud.

Quyết định:

| Tình huống | Việc trên ezCloud |
| --- | --- |
| Chưa có `ezcloudCode` | Tạo reservation mới |
| Có `ezcloudCode`, `updatedAt` local == Ops | Bỏ qua |
| `roomNumber` khác | Đổi phòng |
| `checkIn` / `checkOut` khác | Sửa ngày |
| Có `saleId` mới | Thêm phòng |
| Mất `saleId` (phòng bị xóa trên Ops) | Hủy / bỏ phòng đó trên ezCloud nếu PMS cho phép |

Sau khi tạo trên ezCloud, lưu `ezcloudCode`. Ghi mã Ops `BK-…` vào ghi chú ezCloud để đối chiếu.

Open API **chưa có PATCH** để ghi `EZ-…` ngược lên Ops. Không gọi ingest cho booking vừa đẩy — ingest sẽ tạo bản `origin=ezcloud` trùng.

---

## Map sang ezCloudhotel

Ops không có API ezCloud. Agent phải thao tác UI ezCloudhotel (browser / session đã login).

Dùng **số phòng** (`401`), không dùng `roomId` (`r-401`).

| Ops | ezCloud |
| --- | --- |
| `guestName` | Tên khách |
| `guestPhone` | SĐT |
| `rooms[].roomNumber` | Số phòng |
| `rooms[].checkIn` | Ngày nhận `YYYY-MM-DD` |
| `rooms[].checkOut` | Ngày trả (ngày đi, không tính đêm cuối) |
| `rooms[].adults` / `children` | Người lớn / trẻ em |
| `rooms[].breakfast` | Có / không ăn sáng |
| `rooms[].rate` | Giá / đêm (VND, số nguyên) |
| `source` | Kênh: walk_in, booking, agoda, … |
| `notes` | Ghi chú |
| `pmsCode` (`BK-10-12`) | Ghi vào note: `Ops: BK-10-12` |
| `status=reserved` | Confirmed / arriving |
| `status=inhouse` | In-house — cẩn thận, có thể đã check-in trên Ops |

Một booking Ops có thể nhiều phòng (`rooms[]`). Mỗi phần tử là một room stay. Sync từng phòng theo `saleId`.

Ngày: `checkOut` là ngày trả, đêm ở = nửa khoảng `[checkIn, checkOut)`.

---

## Không làm / tránh vòng

- Không poll không có `origin=ops` rồi đẩy hết lên ezCloud.
- Không `POST /api/ingest/pms` cho booking vừa tạo trên ezCloud từ Ops.
- Không gửi webhook. Không mở port public.
- Không xóa booking Ops.
- Không sync tiền / hóa đơn trừ khi đã tạo reservation thành công.
- Rate-limit: 1 GET / 2 phút là đủ. Không spam.

Chiều ezCloud → Ops (agent khác):

```
POST /api/ingest/pms
Authorization: Bearer $INGEST_SECRET
{ "source": "ezcloud-agent", "bookings": [{ "pmsCode", "roomNumber", "guestName", "arrivalDate", "departureDate", ... }] }
```

Hai agent độc lập. Mapping: ingest gắn `origin=ezcloud`. Agent này chỉ đọc `origin=ops`.

---

## Checklist implement

- [ ] Đọc `OPS_BASE_URL` + `OPS_OPEN_API_TOKEN`
- [ ] Poll 2 phút, `since=polledAt`, `origin=ops`
- [ ] State file: ops id → ezCloud code + snapshot phòng/ngày
- [ ] Tạo reservation ezCloud khi chưa có mapping
- [ ] Đổi phòng / sửa ngày / thêm phòng khi snapshot khác
- [ ] Log mỗi lần sync: ops id, BK code, ezCloud code, hành động, lỗi
- [ ] Retry an toàn (không nhân đôi reservation)
- [ ] Chạy được như process lâu dài trên máy Windows tại khách sạn

---

## Curl thử

```bash
# Lần đầu
curl -sS "$OPS_BASE_URL/api/open/bookings?origin=ops&limit=20" \
  -H "Authorization: Bearer $OPS_OPEN_API_TOKEN"

# Lần sau (dán polledAt)
curl -sS "$OPS_BASE_URL/api/open/bookings?origin=ops&since=2026-10-12T08:00:00.000Z" \
  -H "Authorization: Bearer $OPS_OPEN_API_TOKEN"

# Một booking
curl -sS "$OPS_BASE_URL/api/open/bookings/BK-10-12" \
  -H "Authorization: Bearer $OPS_OPEN_API_TOKEN"
```
