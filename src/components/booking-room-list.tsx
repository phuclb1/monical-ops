import type { ReactNode } from "react";
import Link from "next/link";
import { checkinBookingRoomAction, checkoutBookingRoomAction } from "@/actions/sales";
import { Btn, Chip } from "@/components/ui";
import { CHECK_IN_TIME, CHECK_OUT_TIME, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric, formatTime } from "@/lib/datetime";
import { discountLabel, formatVnd } from "@/lib/sales";
import type { SaleStatus } from "@/lib/types";

const STATUS_TONE: Record<SaleStatus, "ok" | "warn" | "danger" | "gold" | "neutral"> = {
  reserved: "gold",
  inhouse: "ok",
  departed: "neutral",
  cancelled: "danger",
  no_show: "warn",
};

type RoomRow = {
  id: string;
  rate: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  breakfast?: boolean | null;
  discountKind?: string | null;
  discountValue?: number | null;
  status: string;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
  room?: { number?: string | null; type?: string | null } | null;
};

type QuoteLine = {
  nights: number;
  subtotal: number;
  discount: number;
  total: number;
  breakfastOff?: number;
  gross?: number;
};

function roomView(row: RoomRow, quote?: QuoteLine) {
  const breakfast = row.breakfast !== false;
  const ck = row.discountKind && row.discountKind !== "none" ? discountLabel(row.discountKind, row.discountValue) : "";
  return { breakfast, ck, quote };
}

function Totals({
  totals,
  ota,
  otaHotel,
}: {
  ota?: boolean;
  otaHotel?: boolean;
  totals: {
    roomTotal: number;
    discount: number;
    breakfastOff?: number;
    extrasTotal: number;
    total: number;
    deposit: number;
    due: number;
  };
}) {
  const breakfastOff = totals.breakfastOff || 0;
  return (
    <ul className="booking-sum">
      <li>
        <span>Tổng tiền phòng</span>
        <span>{formatVnd(totals.roomTotal + totals.discount + breakfastOff)}</span>
      </li>
      {breakfastOff ? (
        <li className="is-bf-off">
          <span>Không ăn sáng</span>
          <span>−{formatVnd(breakfastOff)}</span>
        </li>
      ) : null}
      {totals.discount ? (
        <li className="is-off">
          <span>Giảm giá</span>
          <span>−{formatVnd(totals.discount)}</span>
        </li>
      ) : null}
      {totals.extrasTotal ? (
        <li className="is-add">
          <span>Chi phí phát sinh</span>
          <span>+{formatVnd(totals.extrasTotal)}</span>
        </li>
      ) : null}
      <li className="is-total">
        <span>Tổng cộng</span>
        <span>{formatVnd(totals.total)}</span>
      </li>
      {ota ? (
        <>
          {totals.deposit ? (
            <li>
              <span>Đã thu</span>
              <span>{formatVnd(totals.deposit)}</span>
            </li>
          ) : null}
          <li className="is-due">
            <span>Công nợ OTA</span>
            <span>{formatVnd(totals.due)}</span>
          </li>
        </>
      ) : otaHotel ? (
        <>
          <li className="flex justify-between gap-2">
            <span>Công nợ OTA</span>
            <span>{formatVnd(0)}</span>
          </li>
          {totals.deposit ? (
            <li className="is-add">
              <span>Đã thu tại KS</span>
              <span>{formatVnd(totals.deposit)}</span>
            </li>
          ) : null}
          <li className="is-due">
            <span>Còn khách thanh toán</span>
            <span>{formatVnd(totals.due)}</span>
          </li>
        </>
      ) : (
        <>
          <li>
            <span>Đã đặt cọc</span>
            <span>{formatVnd(totals.deposit)}</span>
          </li>
          <li className="is-due">
            <span>Còn lại</span>
            <span>{formatVnd(totals.due)}</span>
          </li>
        </>
      )}
    </ul>
  );
}

function stayNote(row: RoomRow) {
  if (row.status === "inhouse") {
    return row.checkedInAt ? `Có khách từ ${formatTime(row.checkedInAt)}` : "Có khách";
  }
  if (row.status === "departed") {
    const parts = [
      row.checkedInAt ? `Vào ${formatTime(row.checkedInAt)}` : "",
      row.checkedOutAt ? `Ra ${formatTime(row.checkedOutAt)}` : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }
  return "";
}

function RoomLink({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function RoomStay({ row, today, bookingId, readOnly }: { row: RoomRow; today: string; bookingId: string; readOnly?: boolean }) {
  const note = stayNote(row);
  const canIn = !readOnly && row.status === "reserved" && today >= row.checkIn;
  const canOut = !readOnly && row.status === "inhouse";
  if (!note && !canIn && !canOut) return null;
  return (
    <div className="booking-room-stay">
      {note ? <p className={row.status === "inhouse" ? "booking-room-in" : "booking-room-out"}>{note}</p> : null}
      {canIn ? (
        <form action={checkinBookingRoomAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="id" value={row.id} />
          <Btn type="submit">Check in</Btn>
        </form>
      ) : null}
      {canOut ? (
        <form action={checkoutBookingRoomAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="id" value={row.id} />
          <Btn type="submit" variant="gold">Check out</Btn>
        </form>
      ) : null}
    </div>
  );
}

export function BookingRoomList({
  rooms,
  quotes,
  totals,
  ota,
  otaHotel,
  today,
  bookingId,
  readOnly = false,
}: {
  rooms: RoomRow[];
  quotes: QuoteLine[];
  ota?: boolean;
  otaHotel?: boolean;
  today: string;
  bookingId: string;
  readOnly?: boolean;
  totals: {
    roomTotal: number;
    discount: number;
    breakfastOff?: number;
    extrasTotal: number;
    total: number;
    deposit: number;
    due: number;
  };
}) {
  return (
    <div className="booking-rooms">
      <div className="booking-rooms-mobile">
        {rooms.map((row, index) => {
          const { breakfast, ck, quote } = roomView(row, quotes[index]);
          return (
            <article key={row.id} className="booking-room">
              <RoomLink href={readOnly ? undefined : `/sales/${row.id}`} className="booking-room-main">
                <p className="booking-room-no">P.{row.room?.number || "—"}</p>
                <p className="booking-room-type">{row.room?.type || "—"}</p>
                <p className="booking-room-dates">
                  {formatDateNumeric(row.checkIn)} {CHECK_IN_TIME}
                  <br />
                  → {formatDateNumeric(row.checkOut)} {CHECK_OUT_TIME}
                </p>
                <div className="booking-room-meta">
                  <span className="booking-room-nights">{quote?.nights ?? 0} đêm</span>
                  <span className="booking-room-pax">
                    {row.adults}/{row.children}
                  </span>
                  <span className={breakfast ? "booking-room-bf" : "booking-room-bf is-off"}>{breakfast ? "✓ Có" : "Không ăn sáng"}</span>
                  <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                </div>
              </RoomLink>
              <RoomLink href={readOnly ? undefined : `/sales/${row.id}`} className="booking-room-money">
                <p className="booking-room-rate">{formatVnd(row.rate)}/đêm</p>
                {quote?.breakfastOff ? (
                  <p className="booking-room-bf-cut">Không ăn sáng −{formatVnd(quote.breakfastOff)}</p>
                ) : null}
                {quote?.discount ? (
                  <p className="booking-room-off">
                    Chiết khấu{ck ? ` ${ck}` : ""} −{formatVnd(quote.discount)}
                  </p>
                ) : null}
                <p className="booking-room-total">{formatVnd(quote?.total ?? 0)}</p>
              </RoomLink>
              <RoomStay row={row} today={today} bookingId={bookingId} readOnly={readOnly} />
            </article>
          );
        })}
      </div>

      <div className="booking-rooms-wrap">
        <table className="booking-rooms-table">
          <thead>
            <tr>
              <th>Phòng</th>
              <th>Ngày</th>
              <th className="is-num">Đêm</th>
              <th>Ăn sáng</th>
              <th className="is-num">Giá</th>
              <th className="is-num">Tổng</th>
              <th>TT</th>
              <th>Khách</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((row, index) => {
              const { breakfast, ck, quote } = roomView(row, quotes[index]);
              return (
                <tr key={row.id}>
                  <td>
                    {readOnly ? (
                      <p className="booking-room-no">P.{row.room?.number || "—"}</p>
                    ) : (
                      <Link href={`/sales/${row.id}`} className="booking-room-no">
                        P.{row.room?.number || "—"}
                      </Link>
                    )}
                    <p className="booking-room-type">{row.room?.type || "—"}</p>
                  </td>
                  <td className="booking-room-dates">
                    {formatDateNumeric(row.checkIn)} {CHECK_IN_TIME}
                    <br />→ {formatDateNumeric(row.checkOut)} {CHECK_OUT_TIME}
                  </td>
                  <td className="is-num booking-room-nights">{quote?.nights ?? 0}</td>
                  <td>
                    <span className={breakfast ? "booking-room-bf" : "booking-room-bf is-off"}>{breakfast ? "✓ Có" : "Không"}</span>
                    {quote?.breakfastOff ? <p className="booking-room-bf-cut">−{formatVnd(quote.breakfastOff)}</p> : null}
                  </td>
                  <td className="is-num">
                    {formatVnd(row.rate)}
                    {quote?.discount ? (
                      <p className="booking-room-off">
                        Chiết khấu{ck ? ` ${ck}` : ""} −{formatVnd(quote.discount)}
                      </p>
                    ) : null}
                  </td>
                  <td className="is-num booking-room-total">{formatVnd(quote?.total ?? 0)}</td>
                  <td>
                    <Chip tone={STATUS_TONE[row.status as SaleStatus]}>{SALE_STATUS_LABEL[row.status as SaleStatus]}</Chip>
                  </td>
                  <td>
                    <RoomStay row={row} today={today} bookingId={bookingId} readOnly={readOnly} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Totals totals={totals} ota={ota} otaHotel={otaHotel} />
    </div>
  );
}
