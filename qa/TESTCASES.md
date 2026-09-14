# Quản lý testcase — Ops Monical

File này là sổ QA. Mỗi lần test: ghi **commit**, **pass/fail**, và **screenshot**.

## Cách chạy một vòng test

1. Local data kịch bản (3 lễ tân + 1 HK): `npm run db:reseed-local`
2. App: `http://localhost:3002`
3. Chụp evidence + assert: `npm run qa:run`
4. Copy block **Run mới nhất** từ `qa/evidence/<run-id>/manifest.json` vào bảng dưới (hoặc để agent cập nhật file này).
5. Ghi commit:

```bash
git rev-parse --short HEAD
# nếu working tree bẩn, thêm hậu tố -dirty
```

Evidence (ảnh) nằm tại `qa/evidence/<run-id>/TC-xx.png` — **đã gitignore**, không commit. `manifest.json` vẫn có thể commit nếu muốn giữ số pass.

Tài khoản local (mật khẩu `123456`): `tuyen` lễ tân tối · `ngan` sáng · `thu` chiều · `uyen` HK · `quanly` quản lý.

---

## Run mới nhất

| | |
|---|---|
| **Run** | `R-20260914-1` |
| **Ngày** | 2026-09-14 22:49 +07 |
| **Commit** | `8d2a100-dirty` (HEAD `8d2a100`, working tree chưa commit — seed local, iPhone, task board, staff) |
| **Môi trường** | local `http://localhost:3002` · data `db:reseed-local` |
| **Pass** | **24 / 24** |
| **Fail** | 0 |
| **Skip** | 12 case catalog chưa gắn runner |
| **Tỷ lệ pass (đã chạy)** | **100%** |
| **Tỷ lệ pass (cả catalog)** | 24 / 36 = **67%** (phần còn lại chưa test vòng này) |

---

## Catalog + kết quả run `R-20260914-1`

Trạng thái: `pass` · `fail` · `skip` (chưa chạy vòng này).

### Đăng nhập / quyền

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-01 | Màn đăng nhập hiện form | khách | pass | `8d2a100-dirty` | [TC-01.png](evidence/R-20260914-1/TC-01.png) |
| TC-02 | Sai mật khẩu hiện lỗi | khách | pass | `8d2a100-dirty` | [TC-02.png](evidence/R-20260914-1/TC-02.png) |
| TC-03 | Lễ tân vào Today, ca đang mở | `tuyen` | pass | `8d2a100-dirty` | [TC-03.png](evidence/R-20260914-1/TC-03.png) |
| TC-04 | Quản lý Today không bị bắt nút Mở ca | `quanly` | pass | `8d2a100-dirty` | [TC-04.png](evidence/R-20260914-1/TC-04.png) |
| TC-05 | HK không vào `/staff` (về Thêm) | `uyen` | pass | `8d2a100-dirty` | [TC-05.png](evidence/R-20260914-1/TC-05.png) |
| TC-06 | Đăng xuất về login | tất cả | skip | — | — |

### Lễ tân — khách

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-10 | Tab khách đến — Nguyễn Thu Hà P.105 | `tuyen` | pass | `8d2a100-dirty` | [TC-10.png](evidence/R-20260914-1/TC-10.png) |
| TC-11 | Tab đang ở — Khoa + Hạnh | `tuyen` | pass | `8d2a100-dirty` | [TC-11.png](evidence/R-20260914-1/TC-11.png) |
| TC-12 | Tab khách đi — Phạm Đức Anh P.102 | `tuyen` | pass | `8d2a100-dirty` | [TC-12.png](evidence/R-20260914-1/TC-12.png) |
| TC-13 | Thẻ check-in: booking xong, chưa check-in PMS | `tuyen` | pass | `8d2a100-dirty` | [TC-13.png](evidence/R-20260914-1/TC-13.png) |
| TC-14 | Gửi ô tô 51H-223.18 + timer đăng ký P.305 | `tuyen` | pass | `8d2a100-dirty` | [TC-14.png](evidence/R-20260914-1/TC-14.png) |
| TC-15 | Checkout: thiếu hóa đơn, việc dọn phòng trả | `tuyen` | pass | `8d2a100-dirty` | [TC-15.png](evidence/R-20260914-1/TC-15.png) |
| TC-16 | Bấm xác nhận check-in PMS → bắt đầu 30 phút | `tuyen` | skip | — | cần test thao tác, làm bẩn data |
| TC-17 | Form ghi xe mới trên thẻ khách | `tuyen` | skip | — | — |
| TC-18 | Gửi HK dọn phòng trả từ thẻ khách đi | `tuyen` | skip | — | — |

### Việc

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-20 | Bảng việc: thay khăn / dọn phòng / checkout | `tuyen` | pass | `8d2a100-dirty` | [TC-20.png](evidence/R-20260914-1/TC-20.png) |
| TC-21 | Việc «cần thêm HK» hiện với lễ tân | `tuyen` | pass | `8d2a100-dirty` | [TC-21.png](evidence/R-20260914-1/TC-21.png) |
| TC-21b | Việc «cần thêm HK» hiện với quản lý | `quanly` | pass | `8d2a100-dirty` | [TC-21b.png](evidence/R-20260914-1/TC-21b.png) |
| TC-22 | Tạo việc — loại lễ tân (khăn, dọn) | `tuyen` | pass | `8d2a100-dirty` | [TC-22.png](evidence/R-20260914-1/TC-22.png) |
| TC-23 | Tạo việc — loại quản lý (đôn việc) | `quanly` | pass | `8d2a100-dirty` | [TC-23.png](evidence/R-20260914-1/TC-23.png) |
| TC-24 | HK thấy khăn / dọn / thêm HK | `uyen` | pass | `8d2a100-dirty` | [TC-24.png](evidence/R-20260914-1/TC-24.png) |
| TC-25 | HK tạo việc (Kiểm INS) | `uyen` | pass | `8d2a100-dirty` | [TC-25.png](evidence/R-20260914-1/TC-25.png) |
| TC-26 | Đổi trạng thái việc Mới → Đang làm → Xong | `uyen` | skip | — | — |

### Bếp / phòng / ca / bàn giao / nhân sự

| ID | Case | Role | Kết quả | Commit | Evidence |
|---|---|---|---|---|---|
| TC-30 | Báo ăn sáng ngày mai (số + dị ứng P.105) | `tuyen` | pass | `8d2a100-dirty` | [TC-30.png](evidence/R-20260914-1/TC-30.png) |
| TC-31 | Bếp bấm đã nhận số | kitchen | skip | — | chưa có user bếp local |
| TC-40 | Danh sách phòng | `tuyen` | pass | `8d2a100-dirty` | [TC-40.png](evidence/R-20260914-1/TC-40.png) |
| TC-41 | Quản lý hạng phòng | `quanly` | skip | — | — |
| TC-50 | Bàn giao hiện trang gom việc | `tuyen` | pass | `8d2a100-dirty` | [TC-50.png](evidence/R-20260914-1/TC-50.png) |
| TC-51 | Tạo bàn giao từ dữ liệu tồn | `tuyen` | skip | — | — |
| TC-60 | Staff: 3 lễ tân + 1 HK + quản lý | `quanly` | pass | `8d2a100-dirty` | [TC-60.png](evidence/R-20260914-1/TC-60.png) |
| TC-61 | Roster tuần Ngân/Thu/Tuyến | `quanly` | pass | `8d2a100-dirty` | [TC-61.png](evidence/R-20260914-1/TC-61.png) |
| TC-62 | Tạo / khóa nhân viên | `quanly` | skip | — | — |
| TC-70 | Checklist ca đêm đang mở | `tuyen` | pass | `8d2a100-dirty` | [TC-70.png](evidence/R-20260914-1/TC-70.png) |
| TC-71 | Lễ tân mở ca khi chưa có ca | `tuyen` | skip | — | data hiện đã mở ca |

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
| TC-13 | `/reception/s-201` | Booking xong · chưa check-in PMS · ghi chú ăn chay |
| TC-14 | `/reception/s-305` | Trần Minh Khoa vừa nhận phòng · xe `51H-223.18` hầm B1-12 · đếm 30 phút ĐKLT |
| TC-15 | `/reception/s-102` | Checkout hôm nay · hóa đơn chưa · việc dọn phòng trả |
| TC-20 | `/tasks` | 3 việc HK: khăn P.305, dọn P.202, dọn trả P.102 |
| TC-21 | `/tasks` | Việc quản lý: *Cần thêm HK ca này — tầng 2 và 3* |
| TC-30 | `/kitchen` | Ngày mai 7 NL · 2 TE · chay 2 · dị ứng 1 |
| TC-04 | login `quanly` `/today` | Có ca đang chạy **hoặc** «Ca lễ tân chưa mở» — **không** nút bắt buộc «Mở ca hiện tại» |

---

## Lịch sử run

Thêm block mới **trên cùng** mỗi lần test.

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
