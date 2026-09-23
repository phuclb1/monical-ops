# Quản lý testcase — Ops Monical

File này là sổ QA. Mỗi lần test: ghi **commit**, **pass/fail**, và **screenshot**.

## Cách chạy một vòng test

**Local** (kịch bản đầy đủ: 3 lễ tân + 1 HK):

1. Data: `npm run db:reseed-local`
2. App: `http://localhost:3002`
3. `npm run qa:run`
4. E2E ca lễ tân + HK (ghi dữ liệu, khác smoke): `npm run qa:e2e`

**PRD** (chỉ `quanly`, không seed khách/việc demo — case kịch bản local bị skip):

1. App: `https://platform.monicalhoteldalat.com`
2. `npm run qa:run:prd`

Sau đó copy block **Run mới nhất** từ `qa/evidence/<run-id>/manifest.json` vào bảng dưới (hoặc để agent cập nhật file này). Ghi commit:

```bash
git rev-parse --short HEAD
# nếu working tree bẩn, thêm hậu tố -dirty
```

Evidence (ảnh) nằm tại `qa/evidence/<run-id>/TC-xx.png` — **đã gitignore**, không commit. `manifest.json` vẫn có thể commit nếu muốn giữ số pass.

Tài khoản local (mật khẩu `123456`): `tuyen` lễ tân tối · `ngan` sáng · `thu` chiều · `uyen` HK · `quanly` quản lý · `chusohuu` chủ sở hữu.

Tài khoản PRD: chỉ `quanly` / `123456`.

---

## Run mới nhất

| | |
|---|---|
| **Run** | `R-20260920-3` |
| **Ngày** | 2026-09-20 21:51 +07 |
| **Commit** | `1e56aca-dirty` |
| **Môi trường** | **local** `http://localhost:3002` |
| **Pass** | **72 / 72** đã chạy |
| **Fail** | 0 |
| **Skip** | catalog còn skip thao tác tay / PWA (TC-06, 17, 18, 26, 31, 51, 62, 71, 80–82) |
| **Tỷ lệ pass (đã chạy)** | **100%** |
| **Ghi chú** | Smoke process HK handoff + tìm booking (TC-13, 72–76, 101, 140–143). E2E `E2E-20260923-1` **27/27 = 100%**. Ca chiều. |

PRD gần nhất: `R-20260915-prd3` · Worker `fe86b482-50aa-4ad3-886d-b0d8e5916ccd` · **19/19 = 100%** (26 skip vì PRD chỉ `quanly`, không seed khách/việc).

---

## Catalog + kết quả run `R-20260919-3` (local)

Trạng thái: `pass` · `fail` · `skip` (chưa chạy vòng này).

### Đăng nhập / quyền

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-01 | Màn đăng nhập hiện form | khách | pass | `a8f4ea7-dirty` | [TC-01.png](evidence/R-20260919-3/TC-01.png) |
| TC-02 | Sai mật khẩu hiện lỗi | khách | pass | `a8f4ea7-dirty` | [TC-02.png](evidence/R-20260919-3/TC-02.png) |
| TC-03 | Lễ tân vào Today, ca đang mở + đầu ca | `tuyen` | pass | `a8f4ea7-dirty` | [TC-03.png](evidence/R-20260919-3/TC-03.png) |
| TC-04 | Quản lý Today không bị bắt nút Mở ca | `quanly` | pass | `a8f4ea7-dirty` | [TC-04.png](evidence/R-20260919-3/TC-04.png) |
| TC-05 | HK không vào `/staff` (về Thêm) | `uyen` | pass | `a8f4ea7-dirty` | [TC-05.png](evidence/R-20260919-3/TC-05.png) |
| TC-06 | Đăng xuất về login | tất cả | skip | — | — |

### Lễ tân — khách

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-10 | Tab khách đến — Nguyễn Thu Hà P.105 | `tuyen` | pass | `a8f4ea7-dirty` | [TC-10.png](evidence/R-20260919-3/TC-10.png) |
| TC-11 | Tab đang ở — Khoa + Hạnh | `tuyen` | pass | `a8f4ea7-dirty` | [TC-11.png](evidence/R-20260919-3/TC-11.png) |
| TC-12 | Tab khách đi — Phạm Đức Anh P.102 | `tuyen` | pass | `a8f4ea7-dirty` | [TC-12.png](evidence/R-20260919-3/TC-12.png) |
| TC-13 | Thẻ check-in P.105: giao HK standby trước nhận | `tuyen` | pass | `a8f4ea7-dirty` | [TC-13.png](evidence/R-20260919-3/TC-13.png) |
| TC-14 | Gửi ô tô 51H-223.18 + timer đăng ký P.305 | `tuyen` | pass | `a8f4ea7-dirty` | [TC-14.png](evidence/R-20260919-3/TC-14.png) |
| TC-15 | Checkout: thiếu hóa đơn, việc dọn phòng trả | `tuyen` | pass | `a8f4ea7-dirty` | [TC-15.png](evidence/R-20260919-3/TC-15.png) |
| TC-16 | Bấm xác nhận check-in PMS → bắt đầu 30 phút | `tuyen` | pass | `a8f4ea7-dirty` | [TC-16.png](evidence/R-20260919-3/TC-16.png) |
| TC-17 | Form ghi xe mới trên thẻ khách | `tuyen` | skip | — | — |
| TC-18 | Gửi HK dọn phòng trả từ thẻ khách đi | `tuyen` | skip | — | — |

### PMS — đối chiếu ezCloudhotel

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-90 | Khách đến: mã EZ-88502, booking đã xác nhận, nút check-in PMS | `tuyen` | pass | `a8f4ea7-dirty` | [TC-90.png](evidence/R-20260919-3/TC-90.png) |
| TC-91 | Khách ở: EZ-88421, check-in PMS đã xác nhận | `tuyen` | pass | `a8f4ea7-dirty` | [TC-91.png](evidence/R-20260919-3/TC-91.png) |
| TC-92 | Khách đi: EZ-88201, chưa checkout PMS / hóa đơn | `tuyen` | pass | `a8f4ea7-dirty` | [TC-92.png](evidence/R-20260919-3/TC-92.png) |

### Bán phòng / giá (ops, không thay PMS)

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-93 | Sơ đồ bán phòng lễ tân | `tuyen` | pass | `a8f4ea7-dirty` | [TC-93.png](evidence/R-20260919-3/TC-93.png) |
| TC-94 | Chỗ bán seed P.401 Đặng Minh Tuấn + P.506 Công ty An Phú | `tuyen` | pass | `a8f4ea7-dirty` | [TC-94.png](evidence/R-20260919-3/TC-94.png) |
| TC-95 | Form bán: giá / đêm, chiết khấu, mã PMS | `tuyen` | pass | `a8f4ea7-dirty` | [TC-95.png](evidence/R-20260919-3/TC-95.png) |
| TC-96 | Giá phòng ngày thường / cuối tuần | `tuyen` | pass | `a8f4ea7-dirty` | [TC-96.png](evidence/R-20260919-3/TC-96.png) |
| TC-97 | Quản lý vào sơ đồ bán + giá phòng | `quanly` | pass | `a8f4ea7-dirty` | [TC-97.png](evidence/R-20260919-3/TC-97.png) |
| TC-98 | HK không vào `/sales` (về Thêm) | `uyen` | pass | `a8f4ea7-dirty` | [TC-98.png](evidence/R-20260919-3/TC-98.png) |
| TC-99 | Form bán: nền tảng Booking.com / Agoda / vãng lai | `tuyen` | pass | `a8f4ea7-dirty` | [TC-99.png](evidence/R-20260919-3/TC-99.png) |
| TC-100 | Sơ đồ lọc Ops / ezCloud | `tuyen` | pass | `a8f4ea7-dirty` | [TC-100.png](evidence/R-20260919-3/TC-100.png) |
| TC-101 | Danh sách đặt phòng: tab Đang mở / đã trả + ô tìm | `tuyen` | pass | `a8f4ea7-dirty` | [TC-101.png](evidence/R-20260919-3/TC-101.png) |
| TC-140 | Tìm booking theo tên không dấu (Đặng) | `tuyen` | — | — | — |
| TC-141 | Tìm booking departed theo SĐT (Lê Hoàng Nam) | `tuyen` | — | — | — |
| TC-142 | Tìm booking không khớp | `tuyen` | — | — | — |
| TC-102 | Quick filter: Sẽ đến / Check-in / Đang ở / Trả / Phòng bẩn | `tuyen` | pass | `a8f4ea7-dirty` | [TC-102.png](evidence/R-20260919-3/TC-102.png) |
| TC-103 | Lọc Sẽ đến hiện Mai Thanh Hà | `tuyen` | pass | `a8f4ea7-dirty` | [TC-103.png](evidence/R-20260919-3/TC-103.png) |
| TC-104 | Lọc Đang ở hiện Đặng Minh Tuấn | `tuyen` | pass | `a8f4ea7-dirty` | [TC-104.png](evidence/R-20260919-3/TC-104.png) |
| TC-105 | Gantt tuần: Đêm trống / booking trong khung | `tuyen` | pass | `a8f4ea7-dirty` | [TC-105.png](evidence/R-20260919-3/TC-105.png) |
| TC-106 | Gantt tháng | `tuyen` | pass | `a8f4ea7-dirty` | [TC-106.png](evidence/R-20260919-3/TC-106.png) |
| TC-107 | Booking An Phú: CK 10%, chưa cọc, còn thu 2.250.000₫ | `tuyen` | pass | `a8f4ea7-dirty` | [TC-107.png](evidence/R-20260919-3/TC-107.png) |
| TC-108 | Booking Đặng: đã cọc 500.000₫, còn thu 1.900.000₫ | `tuyen` | pass | `a8f4ea7-dirty` | [TC-108.png](evidence/R-20260919-3/TC-108.png) |
| TC-109 | Form bán nhiều phòng + cọc / còn phải thu | `tuyen` | pass | `a8f4ea7-dirty` | [TC-109.png](evidence/R-20260919-3/TC-109.png) |
| TC-110 | Sửa booking: thông tin khách + nhật ký | `tuyen` | pass | `a8f4ea7-dirty` | [TC-110.png](evidence/R-20260919-3/TC-110.png) |
| TC-111 | Chi tiết booking có Hủy booking / No-show | `tuyen` | pass | `a8f4ea7-dirty` | [TC-111.png](evidence/R-20260919-3/TC-111.png) |
| TC-114 | Booking 2 phòng Đoàn Minh Châu P.304 + P.404 | `tuyen` | pass | `a8f4ea7-dirty` | [TC-114.png](evidence/R-20260919-3/TC-114.png) |
| TC-115 | Lọc ezCloud ẩn chỗ Ops đêm nay | `tuyen` | pass | `a8f4ea7-dirty` | [TC-115.png](evidence/R-20260919-3/TC-115.png) |
| TC-116 | Giữ chỗ 14 ngày — Mai Thanh Hà | `tuyen` | pass | `a8f4ea7-dirty` | [TC-116.png](evidence/R-20260919-3/TC-116.png) |
| TC-117 | Lọc Check-in hôm nay — Công ty An Phú | `tuyen` | pass | `a8f4ea7-dirty` | [TC-117.png](evidence/R-20260919-3/TC-117.png) |
| TC-118 | In phiếu xác nhận booking Đoàn Minh Châu | `tuyen` | pass | `a8f4ea7-dirty` | [TC-118.png](evidence/R-20260919-3/TC-118.png) |
| TC-119 | Báo cáo doanh thu phòng: tháng/quý/năm, cọc, phải thu, ghi nhận, CK/tiền mặt | `quanly` | pass | `a8f4ea7-dirty` | [TC-119.png](evidence/R-20260919-3/TC-119.png) |
| TC-119b | Lễ tân không vào `/reports/sales` (về Thêm) | `tuyen` | pass | `a8f4ea7-dirty` | [TC-119b.png](evidence/R-20260919-3/TC-119b.png) |
| TC-120 | Chủ sở hữu vào `/owner`: doanh thu tháng/quý/năm | `chusohuu` | pass | `a8f4ea7-dirty` | [TC-120.png](evidence/R-20260919-3/TC-120.png) |
| TC-121 | Chủ sở hữu xem thông tin khách theo kỳ | `chusohuu` | pass | `a8f4ea7-dirty` | [TC-121.png](evidence/R-20260919-3/TC-121.png) |
| TC-122 | Chủ sở hữu không vào `/today` (về `/owner`) | `chusohuu` | pass | `a8f4ea7-dirty` | [TC-122.png](evidence/R-20260919-3/TC-122.png) |

### Thông báo booking

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-130 | Lễ tân chỉ thấy đặt/sửa/hủy booking do mình tạo | `tuyen` | pass | `a8f4ea7-dirty` | [TC-130.png](evidence/R-20260919-3/TC-130.png) |
| TC-131 | Quản lý thấy mọi đặt/sửa/hủy booking | `quanly` | pass | `a8f4ea7-dirty` | [TC-131.png](evidence/R-20260919-3/TC-131.png) |
| TC-132 | HK không thấy noti booking | `uyen` | pass | `a8f4ea7-dirty` | [TC-132.png](evidence/R-20260919-3/TC-132.png) |

### Việc

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-20 | Bảng việc: thay khăn / dọn phòng / checkout | `tuyen` | pass | `a8f4ea7-dirty` | [TC-20.png](evidence/R-20260919-3/TC-20.png) |
| TC-21 | Việc «cần thêm HK» hiện với lễ tân | `tuyen` | pass | `a8f4ea7-dirty` | [TC-21.png](evidence/R-20260919-3/TC-21.png) |
| TC-21b | Việc «cần thêm HK» hiện với quản lý | `quanly` | pass | `a8f4ea7-dirty` | [TC-21b.png](evidence/R-20260919-3/TC-21b.png) |
| TC-22 | Tạo việc — loại lễ tân (khăn, dọn) | `tuyen` | pass | `a8f4ea7-dirty` | [TC-22.png](evidence/R-20260919-3/TC-22.png) |
| TC-23 | Tạo việc — loại quản lý (đôn việc) | `quanly` | pass | `a8f4ea7-dirty` | [TC-23.png](evidence/R-20260919-3/TC-23.png) |
| TC-24 | HK thấy khăn / dọn / thêm HK | `uyen` | pass | `a8f4ea7-dirty` | [TC-24.png](evidence/R-20260919-3/TC-24.png) |
| TC-25 | HK tạo việc (Kiểm phòng) | `uyen` | pass | `a8f4ea7-dirty` | [TC-25.png](evidence/R-20260919-3/TC-25.png) |
| TC-26 | Đổi trạng thái việc Mới → Đang làm → Xong | `uyen` | skip | — | — |

### Bếp / phòng / ca / bàn giao / nhân sự

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-30 | Báo cáo ăn sáng từ booking + dự báo chay/dị ứng | `tuyen` | pass | `a8f4ea7-dirty` | [TC-30.png](evidence/R-20260919-3/TC-30.png) |
| TC-31 | Bếp bấm đã nhận số | kitchen | skip | — | chưa có user bếp local |
| TC-40 | Danh sách phòng | `tuyen` | pass | `a8f4ea7-dirty` | [TC-40.png](evidence/R-20260919-3/TC-40.png) |
| TC-41 | Quản lý hạng phòng | `quanly` | pass | `a8f4ea7-dirty` | [TC-41.png](evidence/R-20260919-3/TC-41.png) |
| TC-50 | Bàn giao hiện trang gom việc | `tuyen` | pass | `a8f4ea7-dirty` | [TC-50.png](evidence/R-20260919-3/TC-50.png) |
| TC-51 | Tạo bàn giao từ dữ liệu tồn | `tuyen` | skip | — | — |
| TC-60 | Staff: 3 lễ tân + 1 HK + quản lý | `quanly` | pass | `a8f4ea7-dirty` | [TC-60.png](evidence/R-20260919-3/TC-60.png) |
| TC-61 | Roster tuần Ngân/Thu/Tuyến | `quanly` | pass | `a8f4ea7-dirty` | [TC-61.png](evidence/R-20260919-3/TC-61.png) |
| TC-62 | Tạo / khóa nhân viên | `quanly` | skip | — | — |
| TC-64 | Nhật ký thao tác: ai / thêm / sửa | `quanly` | pass | `a8f4ea7-dirty` | [TC-64.png](evidence/R-20260919-3/TC-64.png) |
| TC-64b | Lễ tân không vào `/audit` | `tuyen` | pass | `a8f4ea7-dirty` | [TC-64b.png](evidence/R-20260919-3/TC-64b.png) |
| TC-70 | Checklist đầu ca / cuối ca đang mở | `tuyen` | pass | `a8f4ea7-dirty` | [TC-70.png](evidence/R-20260919-3/TC-70.png) |
| TC-71 | Lễ tân mở ca khi chưa có ca | `tuyen` | skip | — | data hiện đã mở ca |
| TC-72 | Today: việc HK dọn khách ở / dọn trả | `tuyen` | pass | `a8f4ea7-dirty` | [TC-72.png](evidence/R-20260919-3/TC-72.png) |
| TC-73 | Bảng việc có dọn P.202 / dọn trả P.102 / khăn P.305 | `tuyen` | pass | `a8f4ea7-dirty` | [TC-73.png](evidence/R-20260919-3/TC-73.png) |
| TC-74 | P.401 inhouse: gửi HK dọn khách ở + kiểm phòng trả | `tuyen` | pass | `a8f4ea7-dirty` | [TC-74.png](evidence/R-20260919-3/TC-74.png) |
| TC-75 | Thẻ khách s-201 sau PMS: gửi HK dọn / kiểm trả | `tuyen` | — | — | — |
| TC-76 | P.506 giữ chỗ: chờ HK standby rồi mới nhận | `tuyen` | pass | `a8f4ea7-dirty` | [TC-76.png](evidence/R-20260919-3/TC-76.png) |
| TC-143 | Booking An Phú: link Giao việc HK từng chỗ | `tuyen` | — | — | — |

### PWA / iPhone

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-80 | Safe area notch + home indicator | phone | skip | — | test tay trên iPhone |
| TC-81 | Không zoom khi focus ô 16px | phone | skip | — | — |
| TC-82 | Cài PWA / icon 192+512 | phone | skip | — | — |

---

## Bước kỳ vọng (case đã seed)

Dùng sau `npm run db:reseed-local`.

| ID | Làm gì | Kỳ vọng |
|---|---|---|
| TC-10 | `/reception?tab=arriving` | Nguyễn Thu Hà, P.105, INS sẵn sàng |
| TC-13 | `/reception/s-201` | Giao việc HK · Yêu cầu HK kiểm phòng standby · chưa nhận |
| TC-14 | `/reception/s-305` | Trần Minh Khoa vừa nhận phòng · xe `51H-223.18` hầm B1-12 · đếm 30 phút ĐKLT |
| TC-15 | `/reception/s-102` | Checkout hôm nay · checklist trả: Hóa đơn · việc dọn phòng trả HK vẫn tách |
| TC-16 | `/reception/s-201` → bấm xác nhận check-in PMS | Chip «Đã check-in PMS … — đã xác nhận», bắt đầu 30 phút ĐKLT |
| TC-90 | `/reception/s-201` | Đối chiếu ezCloudhotel PMS · EZ-88502 · booking đã · nút check-in PMS |
| TC-91 | `/reception/s-305` | EZ-88421 · check-in PMS đã xác nhận |
| TC-92 | `/reception/s-102` | EZ-88201 · nút checkout PMS + xuất hóa đơn |
| TC-93 | `/sales` | Sơ đồ trống / giữ / nhận |
| TC-94 | `/sales` | Đặng Minh Tuấn P.401 · Công ty An Phú P.506 |
| TC-95 | `/sales/new` | Nhận / Trả · phòng trống chưa tích · Giá / đêm · chiết khấu · mã PMS · Ô tô · Xe máy · CK công ty / CK cá nhân / tiền mặt |
| TC-96 | `/sales/rates` login `tuyen` | Redirect về sơ đồ bán, không form Lưu giá |
| TC-97 | `/rooms/manage` login `quanly` | Giá thường · Giá lễ tết · Sức chứa tối đa |
| TC-98 | login `uyen` `/sales` | Redirect Thêm, không menu bán phòng |
| TC-99 | `/sales/new` | Nền tảng · Booking.com · Agoda · Từ ezCloud |
| TC-100 | `/sales` | Lọc Tất cả · Ops · ezCloud |
| TC-101 | `/sales/bookings` | Đặt phòng · Đang mở / đã trả · Tìm booking · Đặng / An Phú / Đoàn / Lê Hoàng Nam (đã trả) |
| TC-140 | `/sales/bookings?q=dang+minh` | Đặng Minh Tuấn · không ra An Phú |
| TC-141 | `/sales/bookings?q=0905555666` | Lê Hoàng Nam · Đã trả |
| TC-142 | `/sales/bookings?q=xyz-khong-co` | Không có booking khớp |
| TC-102 | `/sales` | Quick filter Sẽ đến · Check-in hôm nay · Đang ở · Trả hôm nay · Phòng bẩn |
| TC-103 | `/sales?focus=booking` | Mai Thanh Hà |
| TC-104 | `/sales?focus=inhouse` | Đặng Minh Tuấn |
| TC-105 | `/sales` + `/sales?group=type` | Gantt từ hôm qua · 7 ngày · Theo tầng / Theo hạng phòng · Đêm trống · booking Đặng / An Phú |
| TC-106 | `/sales?view=month` | Tháng sơ đồ · Đêm đã bán |
| TC-107 | `/sales/bookings/sale-506` | CK 10% · Chưa đặt cọc · Còn phải thu 2.250.000₫ |
| TC-108 | `/sales/bookings/sale-401` | Đã đặt cọc 500.000₫ · Còn phải thu 1.900.000₫ · Thanh toán · CK công ty / CK cá nhân / tiền mặt · Thu đủ |
| TC-109 | `/sales/new` chọn ngày rồi 2 phòng trống | Đã chọn 2 phòng · chiết khấu từng phòng · cọc / CK công ty · CK cá nhân · tiền mặt / còn thu · Ô tô · Xe máy |
| TC-110 | `/sales/bookings/sale-401` | Cùng hạng · Nâng hạng · Họ tên · SĐT · Ô tô · Xe máy · Nhật ký Tạo |
| TC-111 | `/sales/bookings/sale-508` | Hủy booking · No-show · In xác nhận |
| TC-114 | `/sales/bookings/bk-doan` | 2 phòng · P.304 · P.404 · đã cọc · còn phải thu |
| TC-115 | `/sales?origin=ezcloud` | Không khớp bộ lọc (chỗ bán seed là Ops) |
| TC-116 | `/sales` | Giữ chỗ 14 ngày tới · Mai Thanh Hà |
| TC-117 | `/sales?focus=arriving` | Check-in hôm nay · Công ty An Phú |
| TC-118 | `/sales/bookings/bk-doan/print` | Phiếu XÁC NHẬN ĐẶT PHÒNG · FAMILY · Xe · tổng tiền / chiết khấu / đặt cọc / còn thanh toán · điều khoản trang 2 · In phiếu · Tải PDF |
| TC-119 | login `quanly` `/reports/sales` | Doanh thu bán phòng · Tháng / Quý / Năm · Đã đặt cọc · Phải thu · ghi nhận · CK công ty · CK cá nhân · tiền mặt |
| TC-119b | login `tuyen` `/reports/sales` | Redirect Thêm, không vào báo cáo doanh thu |
| TC-120 | login `chusohuu` `/owner` | Doanh thu · Tháng / Quý / Năm · Doanh thu ghi nhận · chỉ xem |
| TC-121 | login `chusohuu` `/owner/guests` | Thông tin khách · người lớn / trẻ em · SĐT · phòng · ngày |
| TC-122 | login `chusohuu` `/today` | Redirect `/owner`, không vào vận hành |
| TC-130 | login `tuyen` `/notifications` | Đặt phòng Đặng Minh Tuấn · không thấy Mai Thanh Hà / sửa An Phú / HK |
| TC-131 | login `quanly` `/notifications` | Mọi thêm/sửa/hủy · Đặng Minh Tuấn · Mai Thanh Hà · Sửa An Phú |
| TC-132 | login `uyen` `/notifications` | Thay khăn P.305 · không thấy Đặt phòng |
| TC-20 | `/tasks` | Thay khăn P.305 · Dọn phòng khách ở P.202 · Dọn phòng trả P.102 |
| TC-21 | `/tasks` | Việc quản lý: *Cần thêm HK ca này — tầng 2 và 3* |
| TC-30 | `/kitchen` + `/kitchen/forecast` | Báo cáo suất theo booking · Hôm nay / Ngày mai / 7 ngày · dự báo dị ứng hải sản |
| TC-03 | login `tuyen` `/today` | Ca đang làm · Đầu ca / cuối ca |
| TC-04 | login `quanly` → doanh thu · tab Đặt phòng / Bếp / Việc · `/today` | Có ca đang chạy **hoặc** «Ca lễ tân chưa mở» — **không** nút bắt buộc «Mở ca hiện tại» |
| TC-70 | `/shifts` | Đầu ca · Cuối ca · ca hiện tại Đang mở. Không checklist HK/bếp |
| TC-72 | `/today` | Nhận / trả / HK hôm nay · Dọn phòng khách ở P.202 · Dọn phòng trả P.102 |
| TC-73 | `/tasks` | Dọn phòng khách ở P.202 · Dọn phòng trả P.102 · Thay khăn P.305 |
| TC-74 | `/sales/sale-401` | Giao việc HK · Yêu cầu HK dọn phòng khách ở · Yêu cầu HK kiểm phòng trả |
| TC-75 | `/reception/s-201` sau xác nhận check-in PMS | Giao việc HK · dọn khách ở · kiểm phòng trả |
| TC-76 | `/sales/sale-506` | Giao việc HK · Yêu cầu HK kiểm phòng standby · chưa nút Nhận phòng |
| TC-143 | `/sales/bookings/sale-506` | Gửi HK kiểm phòng trên từng chỗ bán · P.506 · Giao việc HK |
| TC-64 | login `quanly` `/audit` | Nhật ký thao tác · người làm · chi tiết thay đổi before → after |
| TC-64b | login `tuyen` `/audit` | Redirect Thêm, không vào nhật ký |

### E2E — process HK handoff (`npm run qa:e2e`)

Khách `E2E Van A` · P.101. Lễ tân `tuyen` · HK `uyen`.

| ID | Làm gì | Kỳ vọng |
|---|---|---|
| E2E-R1 | Login lễ tân `/today` | Ca đang làm · Đầu ca |
| E2E-R2 | `/shifts` tick 1 mục đầu ca | Đầu ca · Đang mở |
| E2E-R3 | `/sales/new` giữ P.101, cọc, không nhận ngay | Đã giữ · Đã đặt cọc |
| E2E-R4 | `/sales` | Hiện khách E2E P.101 |
| E2E-S1 | `/sales/bookings?q=E2E Van A` | Tìm booking · Đã giữ · tab Đang mở / đã trả |
| E2E-R5 | Booking → Giao việc HK → Yêu cầu HK kiểm phòng standby | Standby P.101 · Chờ HK hoàn thành kiểm standby |
| E2E-H1 | Login HK `/sales` | Không vào bán phòng |
| E2E-H2 | HK `/tasks` hoàn tất Standby P.101 | Hoàn tất |
| E2E-R6 | Lễ tân Giao việc HK → Nhận phòng | Đang ở · nút dọn khách ở |
| E2E-R8 | Yêu cầu HK dọn phòng khách ở | Dọn phòng khách ở P.101 |
| E2E-H3–H4 | HK thấy + hoàn tất dọn khách ở | Hoàn tất |
| E2E-R13 | Yêu cầu HK kiểm phòng trả | Kiểm phòng trả P.101 · chưa nút hoàn tất trả |
| E2E-H7 | HK hoàn tất kiểm phòng trả | Hoàn tất |
| E2E-R14 | Hoàn tất trả phòng | Đã trả |
| E2E-S2 | Tìm booking E2E | Đã trả trên tab Đang mở / đã trả |
| E2E-H8 | HK `/tasks` | Dọn phòng trả P.101 tự tạo |
| E2E-R9 | `/rooms?focus=dirty` | P.101 phòng bẩn |
| E2E-H5–H6 | HK chuyển status + dọn trả | Filter bẩn không còn tên khách E2E |
| E2E-R12 | `/audit` | Lễ tân không vào nhật ký |
| E2E-R11 | `/handover` | Bàn giao |
| E2E-R10 | `/shifts` | Cuối ca · Đang mở |
| E2E-O1 | `/sales/new` nguồn Agoda, phòng trống | Công nợ OTA · không Đặt cọc · không Thu đủ · không Chưa cọc |
| E2E-X1 | `/sales/new` phòng trống, thêm phụ thu khác | Xe đón sân bay · 150.000₫ trên booking đã lưu |
| E2E-O2 | login `quanly` `/reports/sales` | Doanh thu OTA · trước hoa hồng · E2E OTA · Công nợ OTA |
| E2E-O3 | login `chusohuu` `/owner` | Doanh thu OTA · chưa trừ hoa hồng · E2E OTA |

---

## Lịch sử run

Thêm block mới **trên cùng** mỗi lần test.

### E2E-20260923-1 — 2026-09-23

- Commit: `68ab7c5-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail: **27 / 0** · **27/27 = 100%**
- Evidence: `qa/evidence/E2E-20260923-1/`
- Ghi chú: thêm OTA công nợ (E2E-O1), phụ thu lúc tạo (E2E-X1), doanh thu OTA chưa trừ hoa hồng trên báo cáo quản lý (E2E-O2) và trang chủ sở hữu (E2E-O3).

### R-20260920-3 — 2026-09-20

- Commit: `1e56aca-dirty`
- Env: local `http://localhost:3002` (sau `db:reseed-local`)
- Pass / Fail / Skip: **72 / 0 / 0** trong runner · catalog còn skip tay/PWA
- Tỷ lệ: **72/72 = 100%**
- Evidence: `qa/evidence/R-20260920-3/`
- Ghi chú: smoke process HK handoff + tìm booking departed. Ca chiều.

### E2E-20260920-1 — 2026-09-20

- Commit: `1e56aca-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail: **23 / 0** · **23/23 = 100%**
- Evidence: `qa/evidence/E2E-20260920-1/`
- Ghi chú: process mới HK handoff. Bán P.101 E2E Van A → gửi standby → HK xong → nhận phòng → dọn khách ở → kiểm phòng trả → hoàn tất trả → tab Đang mở / đã trả + tìm kiếm hiện Đã trả → hệ thống tự tạo dọn trả.

### E2E-20260919-1 — 2026-09-19

- Commit: `a8f4ea7-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail: **18 / 0** · **18/18 = 100%**
- Evidence: `qa/evidence/E2E-20260919-1/`
- Ghi chú: `npm run qa:e2e` — ca lễ tân + HK. Bán P.101 E2E Van A, checklist đầu ca, nhận phòng, giao dọn HK, HK xong việc, hủy booking (không trả cùng ngày nhận — app chặn 0 đêm).

### R-20260919-3 — 2026-09-19

- Commit: `a8f4ea7-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail / Skip: **68 / 0 / 0** trong runner · catalog còn skip tay/PWA
- Tỷ lệ: **68/68 = 100%**
- Evidence: `qa/evidence/R-20260919-3/`
- Ghi chú: smoke sau clean-arch notifications + PWA localStorage. Fix `"use server"` re-export trong `ops.ts`. Matcher QA không phân biệt hoa/thường vì CSS `uppercase`. Ca sáng.

### E2E-20260916-3 — 2026-09-16

- Commit: `4881717-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail: **18 / 0** · **18/18 = 100%**
- Evidence: `qa/evidence/E2E-20260916-3/`
- Ghi chú: `npm run qa:e2e` — ca lễ tân + HK. Bán P.101 E2E Van A, checklist đầu ca, nhận phòng, giao dọn HK, HK xong việc, hủy booking (không trả cùng ngày nhận — app chặn 0 đêm).

### R-20260916-2 — 2026-09-16

- Commit: `4881717-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail / Skip: **59 / 0 / 0** trong runner · catalog còn skip tay/PWA
- Tỷ lệ: **59/59 = 100%**
- Evidence: `qa/evidence/R-20260916-2/`
- Ghi chú: thêm case bán phòng TC-102–111, 114–117 (quick filter, Gantt, booking 2 phòng Đoàn Minh Châu, cọc/còn thu, sửa/hủy). Ca chiều.

### R-20260915-prd3 — 2026-09-15

- Commit: `ff9574e-dirty`
- Env: https://ops-monical.phuclb1.workers.dev · Worker `fe86b482-50aa-4ad3-886d-b0d8e5916ccd`
- Pass / Fail / Skip: **19 / 0 / 26** · đã chạy 19 = **100%**
- Evidence: `qa/evidence/R-20260915-prd3/`
- Ghi chú: deploy checklist đầu/cuối ca + task nhận/trả. `TC-70` pass với Đầu ca / Cuối ca (quản lý). Skip TC-72–76 vì PRD không seed khách. `TC-61s` skip — lưới tuần chưa đủ 21 ca.

### R-20260915-4 — 2026-09-15

- Commit: `ff9574e-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail / Skip: **42 / 0 / 0** trong runner · catalog còn skip tay/PWA
- Tỷ lệ: **42/42 = 100%**
- Evidence: `qa/evidence/R-20260915-4/`
- Ghi chú: checklist đầu/cuối ca + task nhận/trả theo phòng (TC-72–76). Ca đêm. Seed tự sinh Nhận P.105 / Trả P.102 / Nhận P.506.

### R-20260915-1 — 2026-09-15

- Commit: `7849f8e-dirty`
- Env: local `http://localhost:3002`
- Pass / Fail / Skip: **35 / 0 / 0** trong runner · catalog còn skip tay/PWA
- Tỷ lệ: **35/35 = 100%**
- Evidence: `qa/evidence/R-20260915-1/`
- Ghi chú: thêm PMS (TC-16, 90–92) và bán phòng/giá (TC-93–98). TC-41 hạng phòng pass. Ca chiều.

### R-20260915-prd2 — 2026-09-15

- Commit: `b3a95be-dirty`
- Env: https://ops-monical.phuclb1.workers.dev · Worker `bf8342a9-8961-44dc-b596-15e868704f9d`
- Pass / Fail / Skip: **17 / 0 / 14** · đã chạy 17 = **100%**
- Evidence: `qa/evidence/R-20260915-prd2/`
- Ghi chú: deploy gồm fix `prepareD1` + insert lịch theo lô. `TC-61s` bấm Áp dụng từ hôm nay trên lưới đã đủ 21 ca → không còn `Failed query`.

### R-20260915-prd — 2026-09-15

- Commit: `b3a95be-dirty`
- Env: https://ops-monical.phuclb1.workers.dev
- Pass / Fail / Skip: **1 / 2 / 27** · đã chạy 3 = **33%**
- Evidence: `qa/evidence/R-20260915-prd/`
- Ghi chú: GET `/login` pass (`TC-01`). POST `/api/auth/login` **500** (cả mật khẩu đúng và sai) → `TC-02`/`TC-04` fail; 13 case cần session skip. 14 case kịch bản local skip vì PRD chỉ có `quanly`, không seed khách/việc. Nguyên nhân khả dĩ: `prepareD1` chạy `CREATE UNIQUE INDEX ... effective_from` trước khi ALTER cột trên D1 cũ — đã sửa try/catch từng statement trong `src/lib/db/index.ts`, **chưa deploy**. Cần `npm run deploy` rồi chạy lại `npm run qa:run:prd`.

### R-20260914-1 — 2026-09-14

- Commit: `8d2a100-dirty`
- Env: local :3002
- Kết quả: **24/24 = 100%** (catalog đầy đủ 24/36 = 67% nếu tính skip)
- Evidence: `qa/evidence/R-20260914-1/`
- Ghi chú: assert lần 1 fail 3 case vì `innerText` không đọc textarea; lần 2 đọc cả `input.value` → pass. Screenshot lần 1 đã đúng kịch bản.

---

## Template run tiếp theo

```
### R-YYYYMMDD-n — YYYY-MM-DD
- Commit: `<shortsha>` hoặc `<shortsha>-dirty`
- Env: local / https://ops-monical.phuclb1.workers.dev
- Pass / Fail / Skip:
- Tỷ lệ:
- Evidence: qa/evidence/R-YYYYMMDD-n/
- Ghi chú:
```

Cập nhật bảng catalog: cột Kết quả + Commit + Evidence của **từng dòng đã chạy**. Không xóa lịch sử run cũ.
