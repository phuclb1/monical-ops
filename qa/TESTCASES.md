# Quản lý testcase — Ops Monical

File này là sổ QA. Mỗi lần test: ghi **commit**, **pass/fail**, và **screenshot**.

## Cách chạy một vòng test

**Local** (kịch bản đầy đủ: 3 lễ tân + 1 HK):

1. Data: `npm run db:reseed-local`
2. App: `http://localhost:3002`
3. `npm run qa:run`

**PRD** (chỉ `quanly`, không seed khách/việc demo — case kịch bản local bị skip):

1. App: `https://ops-monical.phuclb1.workers.dev`
2. `npm run qa:run:prd`

Sau đó copy block **Run mới nhất** từ `qa/evidence/<run-id>/manifest.json` vào bảng dưới (hoặc để agent cập nhật file này). Ghi commit:

```bash
git rev-parse --short HEAD
# nếu working tree bẩn, thêm hậu tố -dirty
```

Evidence (ảnh) nằm tại `qa/evidence/<run-id>/TC-xx.png` — **đã gitignore**, không commit. `manifest.json` vẫn có thể commit nếu muốn giữ số pass.

Tài khoản local (mật khẩu `123456`): `tuyen` lễ tân tối · `ngan` sáng · `thu` chiều · `uyen` HK · `quanly` quản lý.

Tài khoản PRD: chỉ `quanly` / `123456`.

---

## Run mới nhất

| | |
|---|---|
| **Run** | `R-20260915-4` |
| **Ngày** | 2026-09-15 22:12 +07 |
| **Commit** | `ff9574e-dirty` |
| **Môi trường** | **local** `http://localhost:3002` |
| **Pass** | **42 / 42** đã chạy |
| **Fail** | 0 |
| **Skip** | catalog còn skip thao tác tay / PWA (TC-06, 17, 18, 26, 31, 51, 62, 71, 80–82) |
| **Tỷ lệ pass (đã chạy)** | **100%** |
| **Ghi chú** | Checklist lễ tân: đầu/cuối ca + task nhận/trả theo phòng (TC-03, 13, 15, 20, 70, 72–76). Ca đêm. |

PRD gần nhất: `R-20260915-prd3` · Worker `fe86b482-50aa-4ad3-886d-b0d8e5916ccd` · **19/19 = 100%** (26 skip vì PRD chỉ `quanly`, không seed khách/việc).

---

## Catalog + kết quả run `R-20260915-4` (local)

Trạng thái: `pass` · `fail` · `skip` (chưa chạy vòng này).

### Đăng nhập / quyền

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-01 | Màn đăng nhập hiện form | khách | pass | `7849f8e-dirty` | [TC-01.png](evidence/R-20260915-1/TC-01.png) |
| TC-02 | Sai mật khẩu hiện lỗi | khách | pass | `7849f8e-dirty` | [TC-02.png](evidence/R-20260915-1/TC-02.png) |
| TC-03 | Lễ tân vào Today, ca đang mở + đầu ca | `tuyen` | pass | `ff9574e-dirty` | [TC-03.png](evidence/R-20260915-4/TC-03.png) |
| TC-04 | Quản lý Today không bị bắt nút Mở ca | `quanly` | pass | `7849f8e-dirty` | [TC-04.png](evidence/R-20260915-1/TC-04.png) |
| TC-05 | HK không vào `/staff` (về Thêm) | `uyen` | pass | `7849f8e-dirty` | [TC-05.png](evidence/R-20260915-1/TC-05.png) |
| TC-06 | Đăng xuất về login | tất cả | skip | — | — |

### Lễ tân — khách

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-10 | Tab khách đến — Nguyễn Thu Hà P.105 | `tuyen` | pass | `7849f8e-dirty` | [TC-10.png](evidence/R-20260915-1/TC-10.png) |
| TC-11 | Tab đang ở — Khoa + Hạnh | `tuyen` | pass | `7849f8e-dirty` | [TC-11.png](evidence/R-20260915-1/TC-11.png) |
| TC-12 | Tab khách đi — Phạm Đức Anh P.102 | `tuyen` | pass | `7849f8e-dirty` | [TC-12.png](evidence/R-20260915-1/TC-12.png) |
| TC-13 | Thẻ check-in: booking xong, chưa check-in PMS | `tuyen` | pass | `ff9574e-dirty` | [TC-13.png](evidence/R-20260915-4/TC-13.png) |
| TC-14 | Gửi ô tô 51H-223.18 + timer đăng ký P.305 | `tuyen` | pass | `7849f8e-dirty` | [TC-14.png](evidence/R-20260915-1/TC-14.png) |
| TC-15 | Checkout: thiếu hóa đơn, việc dọn phòng trả | `tuyen` | pass | `ff9574e-dirty` | [TC-15.png](evidence/R-20260915-4/TC-15.png) |
| TC-16 | Bấm xác nhận check-in PMS → bắt đầu 30 phút | `tuyen` | pass | `7849f8e-dirty` | [TC-16.png](evidence/R-20260915-1/TC-16.png) |
| TC-17 | Form ghi xe mới trên thẻ khách | `tuyen` | skip | — | — |
| TC-18 | Gửi HK dọn phòng trả từ thẻ khách đi | `tuyen` | skip | — | — |

### PMS — đối chiếu ezCloudhotel

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-90 | Khách đến: mã EZ-88502, booking đã xác nhận, nút check-in PMS | `tuyen` | pass | `7849f8e-dirty` | [TC-90.png](evidence/R-20260915-1/TC-90.png) |
| TC-91 | Khách ở: EZ-88421, check-in PMS đã xác nhận | `tuyen` | pass | `7849f8e-dirty` | [TC-91.png](evidence/R-20260915-1/TC-91.png) |
| TC-92 | Khách đi: EZ-88201, chưa checkout PMS / hóa đơn | `tuyen` | pass | `7849f8e-dirty` | [TC-92.png](evidence/R-20260915-1/TC-92.png) |

### Bán phòng / giá (ops, không thay PMS)

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-93 | Sơ đồ bán phòng lễ tân | `tuyen` | pass | `7849f8e-dirty` | [TC-93.png](evidence/R-20260915-1/TC-93.png) |
| TC-94 | Chỗ bán seed P.401 Đặng Minh Tuấn + P.506 Công ty An Phú | `tuyen` | pass | `7849f8e-dirty` | [TC-94.png](evidence/R-20260915-1/TC-94.png) |
| TC-95 | Form bán: giá / đêm, chiết khấu, mã PMS | `tuyen` | pass | `7849f8e-dirty` | [TC-95.png](evidence/R-20260915-1/TC-95.png) |
| TC-96 | Giá phòng ngày thường / cuối tuần | `tuyen` | pass | `7849f8e-dirty` | [TC-96.png](evidence/R-20260915-1/TC-96.png) |
| TC-97 | Quản lý vào sơ đồ bán + giá phòng | `quanly` | pass | `7849f8e-dirty` | [TC-97.png](evidence/R-20260915-1/TC-97.png) |
| TC-98 | HK không vào `/sales` (về Thêm) | `uyen` | pass | `7849f8e-dirty` | [TC-98.png](evidence/R-20260915-1/TC-98.png) |
| TC-99 | Form bán: nền tảng Booking.com / Agoda / vãng lai | — | skip | — | chưa chạy |
| TC-100 | Sơ đồ lọc Tạo trên Ops / Từ ezCloud | — | skip | — | chưa chạy |

### Việc

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-20 | Bảng việc: thay khăn / dọn phòng / checkout | `tuyen` | pass | `ff9574e-dirty` | [TC-20.png](evidence/R-20260915-4/TC-20.png) |
| TC-21 | Việc «cần thêm HK» hiện với lễ tân | `tuyen` | pass | `7849f8e-dirty` | [TC-21.png](evidence/R-20260915-1/TC-21.png) |
| TC-21b | Việc «cần thêm HK» hiện với quản lý | `quanly` | pass | `7849f8e-dirty` | [TC-21b.png](evidence/R-20260915-1/TC-21b.png) |
| TC-22 | Tạo việc — loại lễ tân (khăn, dọn) | `tuyen` | pass | `7849f8e-dirty` | [TC-22.png](evidence/R-20260915-1/TC-22.png) |
| TC-23 | Tạo việc — loại quản lý (đôn việc) | `quanly` | pass | `7849f8e-dirty` | [TC-23.png](evidence/R-20260915-1/TC-23.png) |
| TC-24 | HK thấy khăn / dọn / thêm HK | `uyen` | pass | `7849f8e-dirty` | [TC-24.png](evidence/R-20260915-1/TC-24.png) |
| TC-25 | HK tạo việc (Kiểm INS) | `uyen` | pass | `7849f8e-dirty` | [TC-25.png](evidence/R-20260915-1/TC-25.png) |
| TC-26 | Đổi trạng thái việc Mới → Đang làm → Xong | `uyen` | skip | — | — |

### Bếp / phòng / ca / bàn giao / nhân sự

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-30 | Báo ăn sáng ngày mai (số + dị ứng P.105) | `tuyen` | pass | `7849f8e-dirty` | [TC-30.png](evidence/R-20260915-1/TC-30.png) |
| TC-31 | Bếp bấm đã nhận số | kitchen | skip | — | chưa có user bếp local |
| TC-40 | Danh sách phòng | `tuyen` | pass | `7849f8e-dirty` | [TC-40.png](evidence/R-20260915-1/TC-40.png) |
| TC-41 | Quản lý hạng phòng | `quanly` | pass | `7849f8e-dirty` | [TC-41.png](evidence/R-20260915-1/TC-41.png) |
| TC-50 | Bàn giao hiện trang gom việc | `tuyen` | pass | `7849f8e-dirty` | [TC-50.png](evidence/R-20260915-1/TC-50.png) |
| TC-51 | Tạo bàn giao từ dữ liệu tồn | `tuyen` | skip | — | — |
| TC-60 | Staff: 3 lễ tân + 1 HK + quản lý | `quanly` | pass | `7849f8e-dirty` | [TC-60.png](evidence/R-20260915-1/TC-60.png) |
| TC-61 | Roster tuần Ngân/Thu/Tuyến | `quanly` | pass | `7849f8e-dirty` | [TC-61.png](evidence/R-20260915-1/TC-61.png) |
| TC-62 | Tạo / khóa nhân viên | `quanly` | skip | — | — |
| TC-70 | Checklist đầu ca / cuối ca đang mở | `tuyen` | pass | `ff9574e-dirty` | [TC-70.png](evidence/R-20260915-4/TC-70.png) |
| TC-71 | Lễ tân mở ca khi chưa có ca | `tuyen` | skip | — | data hiện đã mở ca |
| TC-72 | Today: task nhận P.105 / trả P.102 | `tuyen` | pass | `ff9574e-dirty` | [TC-72.png](evidence/R-20260915-4/TC-72.png) |
| TC-73 | Bảng việc có Nhận P.105, Trả P.102, Nhận P.506 | `tuyen` | pass | `ff9574e-dirty` | [TC-73.png](evidence/R-20260915-4/TC-73.png) |
| TC-74 | Task nhận P.105: mục INS / PMS / chìa + note/ảnh | `tuyen` | pass | `ff9574e-dirty` | [TC-74.png](evidence/R-20260915-4/TC-74.png) |
| TC-75 | Thẻ khách s-201 cùng checklist nhận phòng | `tuyen` | pass | `ff9574e-dirty` | [TC-75.png](evidence/R-20260915-4/TC-75.png) |
| TC-76 | Chỗ bán P.506 link checklist nhận phòng | `tuyen` | pass | `ff9574e-dirty` | [TC-76.png](evidence/R-20260915-4/TC-76.png) |

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
| TC-13 | `/reception/s-201` | Booking xong · chưa check-in PMS · checklist nhận: Phòng INS / Check-in PMS / Đưa chìa |
| TC-14 | `/reception/s-305` | Trần Minh Khoa vừa nhận phòng · xe `51H-223.18` hầm B1-12 · đếm 30 phút ĐKLT |
| TC-15 | `/reception/s-102` | Checkout hôm nay · checklist trả: Hóa đơn · việc dọn phòng trả HK vẫn tách |
| TC-16 | `/reception/s-201` → bấm xác nhận check-in PMS | Chip «Đã check-in PMS … — đã xác nhận», bắt đầu 30 phút ĐKLT |
| TC-90 | `/reception/s-201` | Đối chiếu ezCloudhotel PMS · EZ-88502 · booking đã · nút check-in PMS |
| TC-91 | `/reception/s-305` | EZ-88421 · check-in PMS đã xác nhận |
| TC-92 | `/reception/s-102` | EZ-88201 · nút checkout PMS + xuất hóa đơn |
| TC-93 | `/sales` | Sơ đồ trống / giữ / nhận |
| TC-94 | `/sales` | Đặng Minh Tuấn P.401 · Công ty An Phú P.506 |
| TC-95 | `/sales/new` | Giá / đêm · chiết khấu · mã PMS |
| TC-96 | `/sales/rates` login `tuyen` | Redirect về sơ đồ bán, không form Lưu giá |
| TC-98 | login `uyen` `/sales` | Redirect Thêm, không menu bán phòng |
| TC-99 | `/sales/new` | Nền tảng · Booking.com · Agoda · Tạo trên Ops |
| TC-100 | `/sales` | Lọc Tất cả · Ops · ezCloud · Booking |
| TC-20 | `/tasks` | 3 việc HK cũ **và** Nhận P.105 · Trả P.102 |
| TC-21 | `/tasks` | Việc quản lý: *Cần thêm HK ca này — tầng 2 và 3* |
| TC-30 | `/kitchen` | Ngày mai 7 NL · 2 TE · chay 2 · dị ứng 1 |
| TC-03 | login `tuyen` `/today` | Ca đang làm · Đầu ca / cuối ca · Nhận P.105 |
| TC-04 | login `quanly` `/today` | Có ca đang chạy **hoặc** «Ca lễ tân chưa mở» — **không** nút bắt buộc «Mở ca hiện tại» |
| TC-70 | `/shifts` | Đầu ca · Cuối ca · ca hiện tại Đang mở. Không checklist HK/bếp |
| TC-72 | `/today` | Nhận P.105 · Trả P.102 |
| TC-73 | `/tasks` | Nhận P.105 · Trả P.102 · Nhận P.506 Công ty An Phú |
| TC-74 | `/tasks` → việc Nhận P.105 | Phòng INS · Check-in PMS · Đưa chìa · ô ghi chú / ảnh |
| TC-75 | `/reception/s-201` | Cùng checklist nhận với task (không list derived cũ trong khối checklist) |
| TC-76 | `/sales/sale-506` | Checklist lễ tân · Nhận phòng P.506 |

---

## Lịch sử run

Thêm block mới **trên cùng** mỗi lần test.

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
