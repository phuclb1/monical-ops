import {
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  HOTEL_ADDRESS,
  HOTEL_BANK_HOLDER,
  HOTEL_BANK_NAME,
  HOTEL_BANK_NUMBER,
  HOTEL_EMAIL,
  HOTEL_LETTERHEAD,
  HOTEL_PHONE,
  HOTEL_WEBSITE,
  SALE_SOURCE_LABEL,
} from "@/lib/constants";
import { formatDateNumeric, formatStayStamp } from "@/lib/datetime";
import { bookingDisplayCode, bookingQuote, formatVndLetter, isOtaDebt, isOtaSource, parkingLabel } from "@/lib/sales";
import type { SaleSource } from "@/lib/types";
import type { getBooking } from "@/lib/repos";

type Booking = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

function money(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function pax(adults: number, children: number) {
  return children ? `${adults} NL / ${children} TE` : `${adults} NL`;
}

function SheetHead() {
  const site = HOTEL_WEBSITE.replace(/^https?:\/\//, "");
  return (
    <header className="booking-sheet-head">
      <img src="/logo.png" alt="MONICAL hotel dalat" className="booking-sheet-logo" />
      <div className="booking-sheet-brand">
        <p className="booking-sheet-hotel">{HOTEL_LETTERHEAD.toUpperCase()}</p>
        <p>Địa chỉ: {HOTEL_ADDRESS}</p>
        <p>
          SĐT: {HOTEL_PHONE} · Email: {HOTEL_EMAIL}
        </p>
        {site ? <p>Website: {site}</p> : null}
      </div>
    </header>
  );
}

export function BookingConfirmation({ booking }: { booking: Booking }) {
  const quote = bookingQuote(booking.rooms);
  const code = bookingDisplayCode(booking);
  const guest = booking.guestName.toUpperCase();
  const arrive = formatStayStamp(booking.checkIn, CHECK_IN_TIME);
  const depart = formatStayStamp(booking.checkOut, CHECK_OUT_TIME);
  const source = SALE_SOURCE_LABEL[booking.source as SaleSource] || booking.source || "—";
  const gross = quote.subtotal + quote.breakfastOff + (booking.extrasTotal || 0);
  const afterDiscount = booking.total;
  const ota = isOtaSource(booking.source);
  const otaDebt = isOtaDebt(booking.source, booking.otaPaymentMode);

  return (
    <article className="booking-sheet">
      <section className="booking-sheet-page">
        <SheetHead />

        <h1>XÁC NHẬN ĐẶT PHÒNG</h1>
        <p>
          Lời chào nồng nhiệt từ {HOTEL_LETTERHEAD}! Chúng tôi chân thành cảm ơn Quý khách đã lựa chọn Monical là một
          phần của chuyến ghé thăm Đà Lạt!
        </p>
        <p>
          {HOTEL_LETTERHEAD} rất vui được xác nhận đặt phòng của Quý khách như sau:
        </p>

        <h2>THÔNG TIN CHUNG</h2>
        <table className="booking-sheet-info">
          <tbody>
            <tr>
              <th>Khách</th>
              <td>{guest}</td>
              <th>Nguồn</th>
              <td>{source}</td>
            </tr>
            <tr>
              <th>SĐT / Tel</th>
              <td>{booking.guestPhone || ""}</td>
              <th>Số xác nhận</th>
              <td>{code}</td>
            </tr>
            <tr>
              <th>Ghi chú / Notes</th>
              <td colSpan={3}>{booking.notes || ""}</td>
            </tr>
            <tr>
              <th>Khách ở</th>
              <td>{pax(booking.adults, booking.children)}</td>
              <th>Ăn sáng</th>
              <td>{pax(booking.breakfastAdults ?? booking.adults, booking.breakfastChildren ?? booking.children)}</td>
            </tr>
            <tr>
              <th>Xe</th>
              <td>{parkingLabel(booking.cars, booking.bikes)}</td>
              <th>Hóa đơn</th>
              <td>{booking.invoiceRequested ? "Có" : "Không"}</td>
            </tr>
          </tbody>
        </table>

        <h2>CHI TIẾT ĐẶT PHÒNG</h2>
        <table className="booking-sheet-grid">
          <thead>
            <tr>
              <th>Hạng phòng</th>
              <th>Ngày đến</th>
              <th>Ngày đi</th>
              <th>Khách</th>
              <th>Số đêm</th>
              <th>Giá/đêm</th>
              <th>Giảm giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {booking.rooms.map((row, index) => {
              const line = quote.lines[index];
              return (
                <tr key={row.id}>
                  <td>{row.room?.type || "—"}</td>
                  <td>{formatDateNumeric(row.checkIn)}</td>
                  <td>{formatDateNumeric(row.checkOut)}</td>
                  <td>{pax(row.adults, row.children)}</td>
                  <td>{line?.nights ?? 0}</td>
                  <td className="booking-sheet-num">{money(row.rate)}</td>
                  <td className="booking-sheet-num">{line?.discount ? money(line.discount) : "—"}</td>
                  <td className="booking-sheet-num">{money(line?.total ?? 0)}</td>
                </tr>
              );
            })}
            {booking.extras.map((row) => (
              <tr key={row.id}>
                <td colSpan={7}>{row.name}</td>
                <td className="booking-sheet-num">{money(row.amount)}</td>
              </tr>
            ))}
            <tr className="is-total">
              <td colSpan={7}>TỔNG CỘNG</td>
              <td className="booking-sheet-num">{money(afterDiscount)}</td>
            </tr>
          </tbody>
        </table>

        <h2>THANH TOÁN</h2>
        <div className="booking-sheet-pay">
          <table className="booking-sheet-kv">
            <tbody>
              <tr>
                <th>Chủ tài khoản</th>
                <td>{HOTEL_BANK_HOLDER || "—"}</td>
              </tr>
              <tr>
                <th>Số tài khoản</th>
                <td>{HOTEL_BANK_NUMBER || "—"}</td>
              </tr>
              <tr>
                <th>Ngân hàng</th>
                <td>{HOTEL_BANK_NAME || "—"}</td>
              </tr>
            </tbody>
          </table>
          <table className="booking-sheet-sum">
            <tbody>
              <tr>
                <th>Tổng tiền</th>
                <td className="booking-sheet-num">{formatVndLetter(gross)}</td>
              </tr>
              <tr>
                <th>Chiết khấu</th>
                <td className="booking-sheet-num">{formatVndLetter(quote.discount)}</td>
              </tr>
              <tr>
                <th>Tổng tiền sau chiết khấu</th>
                <td className="booking-sheet-num">{formatVndLetter(afterDiscount)}</td>
              </tr>
              {otaDebt ? (
                <>
                  {booking.deposit ? (
                    <tr>
                      <th>Đã thu</th>
                      <td className="booking-sheet-num">{formatVndLetter(booking.deposit)}</td>
                    </tr>
                  ) : null}
                  <tr className="is-strong">
                    <th>Công nợ OTA</th>
                    <td className="booking-sheet-num">{formatVndLetter(booking.due)}</td>
                  </tr>
                </>
              ) : ota ? (
                <>
                  <tr>
                    <th>Công nợ OTA</th>
                    <td className="booking-sheet-num">{formatVndLetter(0)}</td>
                  </tr>
                  <tr>
                    <th>Đã thu tại khách sạn</th>
                    <td className="booking-sheet-num">{formatVndLetter(booking.deposit)}</td>
                  </tr>
                  <tr className="is-strong">
                    <th>Còn khách thanh toán</th>
                    <td className="booking-sheet-num">{formatVndLetter(booking.due)}</td>
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <th>Đặt cọc</th>
                    <td className="booking-sheet-num">{formatVndLetter(booking.deposit)}</td>
                  </tr>
                  <tr className="is-strong">
                    <th>Còn phải thanh toán</th>
                    <td className="booking-sheet-num">{formatVndLetter(booking.due)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="booking-sheet-page">
        <SheetHead />
        <h2>ĐIỀU KHOẢN &amp; CHÍNH SÁCH</h2>
        <h3>I. Thời gian nhận phòng và trả phòng</h3>
        <p>Giờ nhận phòng: 14h00 (lễ, tết: 15h00) — Giờ trả phòng: 12:00.</p>
        <ul>
          <li>Nhận phòng sớm từ 03:00 đến 09:00: phụ thu 50% tiền phòng.</li>
          <li>Nhận phòng sớm trước 03:00: phụ thu 100% tiền phòng.</li>
          <li>Trả phòng muộn từ 12:00 đến 17:00: phụ thu 50% tiền phòng.</li>
          <li>Trả phòng muộn từ sau 17:00: phụ thu 100% tiền phòng.</li>
          <li>Hỗ trợ nhận phòng sớm từ sau 09:00 không phụ thu (tùy tình trạng phòng trống).</li>
        </ul>

        <h3>II. Chính sách trẻ em</h3>
        <ol>
          <li>Trẻ em từ 0–5 tuổi và dưới 1m: Không phụ thu.</li>
          <li>Trẻ em từ 6–12 tuổi: Phụ thu 200,000/bé/đêm (lễ, tết: 350,000/bé/đêm).</li>
          <li>Trẻ em trên 12 tuổi tính như một người lớn.</li>
        </ol>

        <h3>III. Chính sách hủy</h3>
        <ol>
          <li>Hủy phòng từ ≥7 ngày (lễ tết: 12 ngày) trước ngày check in: hoàn 100% cọc.</li>
          <li>Hủy phòng từ &lt; 7 ngày (lễ tết: 12 ngày) trước ngày check in: không hoàn tiền.</li>
          <li>Đối với đặt phòng OTA: dựa theo chính sách hủy phòng của OTA.</li>
        </ol>

        <h3>Lưu ý</h3>
        <ul>
          <li>
            Monical là khách sạn không hút thuốc, Anh/Chị vui lòng không hút thuốc trong quá trình lưu trú. Quý khách có
            nhu cầu vui lòng sử dụng sân vườn ở tầng 6 khu vực Bistro.
          </li>
          <li>
            Trong suốt quá trình lưu trú, Anh/Chị vui lòng không di chuyển nội thất và các thiết bị điện cố định, không
            ngắt dây nguồn kết nối điện thoại vì lý do an toàn phòng chống cháy nổ.
          </li>
          <li>
            Khách sạn không phục vụ ăn uống trong phòng, khách hàng vui lòng tham khảo kỹ các nội quy đặt tại phòng, để
            tránh làm ảnh hưởng vệ sinh cho các khách hàng lưu trú sau.
          </li>
          <li>Quý khách vui lòng tham khảo Nội quy và Biểu phí các dịch vụ trong Tệp hồ sơ ở mỗi phòng.</li>
        </ul>

        <p>
          Thời gian nhận phòng: {CHECK_IN_TIME} {arrive}
          <span className="booking-sheet-sep"> · </span>
          Thời gian trả phòng: {CHECK_OUT_TIME} {depart}
        </p>
        <p>Yêu cầu thêm xin gửi mail tới {HOTEL_EMAIL}. Cảm ơn quý khách đã sử dụng dịch vụ của chúng tôi.</p>
      </section>
    </article>
  );
}
