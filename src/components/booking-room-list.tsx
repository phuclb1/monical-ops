import Link from "next/link";
import { Chip } from "@/components/ui";
import { CHECK_IN_TIME, CHECK_OUT_TIME, SALE_STATUS_LABEL } from "@/lib/constants";
import { formatDateNumeric } from "@/lib/datetime";
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
}: {
  ota?: boolean;
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

export function BookingRoomList({
  rooms,
  quotes,
  totals,
  ota,
}: {
  rooms: RoomRow[];
  quotes: QuoteLine[];
  ota?: boolean;
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
            <Link key={row.id} href={`/sales/${row.id}`} className="booking-room">
              <div>
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
              </div>
              <div className="booking-room-money">
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
              </div>
            </Link>
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
            </tr>
          </thead>
          <tbody>
            {rooms.map((row, index) => {
              const { breakfast, ck, quote } = roomView(row, quotes[index]);
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={`/sales/${row.id}`} className="booking-room-no">
                      P.{row.room?.number || "—"}
                    </Link>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Totals totals={totals} ota={ota} />
    </div>
  );
}
