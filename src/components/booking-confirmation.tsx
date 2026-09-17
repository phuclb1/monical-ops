import {
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  HOTEL_ADDRESS,
  HOTEL_EMAIL,
  HOTEL_LETTERHEAD,
  HOTEL_PHONE,
} from "@/lib/constants";
import { formatDateNumeric, formatStayStamp } from "@/lib/datetime";
import { bookingDisplayCode, bookingQuote, formatVndLetter, nightsBetween } from "@/lib/sales";
import type { getBooking } from "@/lib/repos";

type Booking = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

function MoneyRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="booking-sheet-num">{formatVndLetter(value)}</td>
    </tr>
  );
}

export function BookingConfirmation({ booking }: { booking: Booking }) {
  const quote = bookingQuote(booking.rooms);
  const nights = Math.max(0, nightsBetween(booking.checkIn, booking.checkOut));
  const code = bookingDisplayCode(booking);
  const guest = booking.guestName.toUpperCase();
  const bookedOn = formatDateNumeric(booking.createdAt);
  const arrive = formatStayStamp(booking.checkIn, CHECK_IN_TIME);
  const depart = formatStayStamp(booking.checkOut, CHECK_OUT_TIME);

  return (
    <article className="booking-sheet">
      <header className="booking-sheet-head">
        <img src="/logo.png" alt="MONICAL hotel dalat" className="booking-sheet-logo" />
        <div className="booking-sheet-brand">
          <p className="booking-sheet-hotel">{HOTEL_LETTERHEAD}</p>
          <p>Địa chỉ: {HOTEL_ADDRESS}</p>
          <p>
            Email: {HOTEL_EMAIL} — ĐT: {HOTEL_PHONE}
          </p>
        </div>
      </header>

      <h1>XÁC NHẬN ĐẶT PHÒNG</h1>
      <p className="booking-sheet-code">MÃ ĐẶT PHÒNG: {code}</p>

      <p>
        Kính gửi <strong>{guest}</strong>
      </p>
      <p>
        Cảm ơn quý khách đã lựa chọn Monical cho kỳ nghỉ của mình. Chúng tôi xin được thông báo yêu cầu đặt phòng của
        quý khách đã được <strong>XÁC NHẬN</strong>.
      </p>
      <p>Monical Hotel Dalat rất vui được xác nhận đặt phòng của Quý khách như sau:</p>

      <h2>Thông tin đặt phòng</h2>
      <table className="booking-sheet-kv">
        <tbody>
          <tr>
            <th>Ngày đặt</th>
            <td>{bookedOn || "—"}</td>
          </tr>
          <tr>
            <th>Ngày đến đầu</th>
            <td>{arrive}</td>
          </tr>
          <tr>
            <th>Ngày đi cuối</th>
            <td>{depart}</td>
          </tr>
          <tr>
            <th>Tổng số đêm</th>
            <td>{nights}</td>
          </tr>
        </tbody>
      </table>

      <h2>Thông tin chung</h2>
      <table className="booking-sheet-kv">
        <tbody>
          <tr>
            <th>Tên đầy đủ</th>
            <td>{guest}</td>
          </tr>
          <tr>
            <th>Email</th>
            <td></td>
          </tr>
          <tr>
            <th>Quốc tịch</th>
            <td>Vietnam</td>
          </tr>
          <tr>
            <th>Điện thoại</th>
            <td>{booking.guestPhone || ""}</td>
          </tr>
        </tbody>
      </table>

      <h2>Thông tin phòng</h2>
      <table className="booking-sheet-grid">
        <thead>
          <tr>
            <th>Phòng</th>
            <th>Ngày vào</th>
            <th>Ngày ra</th>
            <th>Số đêm</th>
            <th>NL/TE</th>
            <th>Giá phòng (VND)</th>
          </tr>
        </thead>
        <tbody>
          {booking.rooms.map((row, index) => {
            const line = quote.lines[index];
            return (
              <tr key={row.id}>
                <td>
                  <div>{row.room?.type || "—"}</div>
                  <div>{row.room?.number || "—"}</div>
                </td>
                <td>{formatStayStamp(row.checkIn, CHECK_IN_TIME)}</td>
                <td>{formatStayStamp(row.checkOut, CHECK_OUT_TIME)}</td>
                <td>{line?.nights ?? 0}</td>
                <td>
                  {row.adults}/{row.children}
                </td>
                <td className="booking-sheet-num">{formatVndLetter(row.rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Tổng tiền</h2>
      <table className="booking-sheet-sum">
        <thead>
          <tr>
            <th>Chi tiết</th>
            <th>Giá (VND)</th>
          </tr>
        </thead>
        <tbody>
          <MoneyRow label="Tổng tiền phòng" value={quote.subtotal} />
          <MoneyRow label="Tổng cộng" value={quote.subtotal} />
          <MoneyRow label="Giảm giá" value={quote.discount} />
          {booking.extras.map((row) => (
            <MoneyRow key={row.id} label={row.name} value={row.amount} />
          ))}
          <MoneyRow label="Tiền cọc" value={booking.deposit} />
        </tbody>
      </table>

      <h2>Thanh toán</h2>
      <table className="booking-sheet-sum">
        <tbody>
          <MoneyRow label="Tổng tiền" value={booking.total} />
          <MoneyRow label="Đã đặt cọc" value={booking.deposit} />
        </tbody>
      </table>
      <p className="booking-sheet-remain-label">Còn lại</p>
      <p className="booking-sheet-remain">
        Số tiền còn lại phải thanh toán <strong>{formatVndLetter(booking.due)}</strong>
      </p>

      <h2>Đặt và thanh toán bởi</h2>
      <p>
        <strong>{guest}</strong>
      </p>

      <h2>Điều khoản &amp; Chính sách</h2>
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
      <p>
        Trong trường hợp quý khách hàng có thêm yêu cầu xin gửi mail tới địa chỉ: {HOTEL_EMAIL}
      </p>
      <p>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!</p>
    </article>
  );
}
