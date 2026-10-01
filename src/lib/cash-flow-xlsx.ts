import { SALE_SOURCE_LABEL } from "./constants";
import { formatDateNumeric } from "./datetime";
import { bookingDisplayCode } from "./sales";
import { CASH_FLOW_KIND_LABEL, type CashFlowLine, type CashFlowTotals } from "./sales-report";
import { workbookXlsx } from "./xlsx";
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
};

function statusOf(flow: CashFlowLine) {
  if (flow.refund) return "Hoàn cọc";
  return flow.recognized ? "Đã ghi nhận" : "Chưa ghi nhận";
}

export function cashFlowXlsx<T extends ExportBooking>(report: {
  rows: { booking: T; flow: CashFlowLine }[];
  totals: CashFlowTotals;
}) {
  const rows: (string | number)[][] = [
    [...HEADERS],
    ...report.rows.map(({ booking, flow }) => [
      booking.guestName,
      bookingDisplayCode(booking),
      SALE_SOURCE_LABEL[booking.source as SaleSource] || booking.source,
      CASH_FLOW_KIND_LABEL[flow.kind],
      formatDateNumeric(booking.createdAt),
      formatDateNumeric(flow.refund ? booking.refundedAt || booking.checkIn : booking.checkIn),
      statusOf(flow),
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
  return workbookXlsx({ name: "Dòng tiền", rows, numericColumns: MONEY_COLUMNS });
}
