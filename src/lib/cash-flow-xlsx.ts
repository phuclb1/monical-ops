import { PAYMENT_METHOD_LABEL, SALE_SOURCE_LABEL } from "./constants";
import { formatDateNumeric } from "./datetime";
import { bookingDisplayCode, refundReasonLabel } from "./sales";
import {
  CASH_FLOW_KIND_LABEL,
  type ActualCashTotals,
  type ActualCashTx,
  type CashFlowLine,
  type CashFlowTotals,
} from "./sales-report";
import { workbookXlsxSheets } from "./xlsx";
import type { SaleSource } from "./types";

const HEADERS = [
  "Tên khách",
  "Mã",
  "Nguồn",
  "Hình thức",
  "Ngày tạo",
  "Ngày ghi nhận",
  "Ghi nhận",
  "Tổng gồm VAT",
  "Chưa VAT",
  "VAT",
  "Tiền mặt",
  "CK cá nhân",
  "CK công ty",
  "Phải thu OTA",
  "Hoa hồng đã khấu trừ",
  "Phải trả hoa hồng",
  "Khách còn nợ",
] as const;

const MONEY_COLUMNS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

type ExportBooking = {
  id: string;
  guestName: string;
  pmsCode?: string | null;
  source: string;
  createdAt: string;
  checkIn: string;
  refundedAt?: string | null;
  refundReason?: string | null;
};

function statusOf(flow: CashFlowLine, booking: ExportBooking) {
  if (flow.refund) return refundReasonLabel(booking.refundReason);
  return flow.recognized ? "Đã ghi nhận" : "Chưa ghi nhận";
}

const ACTUAL_HEADERS = ["Booking ID", "Họ tên", "Số phòng", "Ngày đến", "Ngày đi", "Số tiền", "Loại", "Hình thức"] as const;

export function cashFlowXlsx<T extends ExportBooking>(
  report: {
    rows: { booking: T; flow: CashFlowLine }[];
    totals: CashFlowTotals;
  },
  actual?: {
    rows: ActualCashTx[];
    totals: ActualCashTotals;
  },
) {
  const rows: (string | number)[][] = [
    [...HEADERS],
    ...report.rows.map(({ booking, flow }) => [
      booking.guestName,
      bookingDisplayCode(booking),
      SALE_SOURCE_LABEL[booking.source as SaleSource] || booking.source,
      CASH_FLOW_KIND_LABEL[flow.kind],
      formatDateNumeric(booking.createdAt),
      formatDateNumeric(flow.refund ? booking.refundedAt || booking.checkIn : booking.checkIn),
      statusOf(flow, booking),
      flow.gross,
      flow.net,
      flow.vat,
      flow.cash,
      flow.transfer,
      flow.company,
      flow.receivable,
      flow.withheld,
      flow.payable,
      flow.guestDue,
    ]),
    [
      "Tổng",
      "",
      "",
      "",
      "",
      "",
      "",
      report.totals.gross,
      report.totals.net,
      report.totals.vat,
      report.totals.cash,
      report.totals.transfer,
      report.totals.company,
      report.totals.receivable,
      report.totals.withheld,
      report.totals.payable,
      report.totals.guestDue,
    ],
  ];
  const sheets = [{ name: "Dòng tiền", rows, numericColumns: MONEY_COLUMNS }];
  if (actual) {
    sheets.push({
      name: "Thực tế",
      numericColumns: [5],
      rows: [
        [...ACTUAL_HEADERS],
        ...actual.rows.map((row) => [
          row.bookingCode,
          row.guestName,
          row.roomLabel,
          formatDateNumeric(row.checkIn),
          formatDateNumeric(row.checkOut),
          row.amount,
          row.typeLabel,
          PAYMENT_METHOD_LABEL[row.method],
        ]),
        ["Tổng", "", "", "", "", actual.totals.amount, "", ""],
      ],
    });
  }
  return workbookXlsxSheets(sheets);
}
