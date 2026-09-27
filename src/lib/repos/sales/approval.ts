import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO } from "../../datetime";
import { can } from "../../permissions";
import type { SessionUser } from "../../types";
import { notify } from "@/modules/notifications/models/notifications";
import { audit } from "../audit";
import { listUsers } from "../users";
import { type BookingUpdateInput, updateBooking } from "./booking";
import { addRoomsToBooking } from "./create";
import { type SaleExtraDraft, addBookingExtra, removeBookingExtra } from "./extras";
import { moveGanttSale } from "./move";
import { getBooking } from "./queries";

type ApprovalKind = "booking_update" | "move_room" | "add_rooms" | "add_extra" | "remove_extra";
type RequestPayload =
  | { kind: "booking_update"; data: BookingUpdateInput }
  | { kind: "move_room"; data: { saleId: string; roomId: string; checkIn: string; checkOut: string } }
  | { kind: "add_rooms"; saleId: string; roomIds: string[] }
  | { kind: "add_extra"; data: SaleExtraDraft }
  | { kind: "remove_extra"; extraId: string };

type BookingView = NonNullable<Awaited<ReturnType<typeof getBooking>>>;

function snapshotBooking(booking: BookingView) {
  return {
    guestName: booking.guestName,
    guestPhone: booking.guestPhone,
    source: booking.source,
    otaPaymentMode: booking.otaPaymentMode,
    invoiceRequested: booking.invoiceRequested,
    adults: booking.adults,
    children: booking.children,
    breakfastAdults: booking.breakfastAdults,
    breakfastChildren: booking.breakfastChildren,
    cars: booking.cars,
    bikes: booking.bikes,
    deposit: booking.deposit,
    cashPaid: booking.cashPaid,
    transferPaid: booking.transferPaid,
    companyPaid: booking.companyPaid,
    notes: booking.notes,
    rooms: booking.rooms
      .map((row) => ({
        id: row.id,
        roomId: row.roomId,
        status: row.status,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        rate: row.rate,
        breakfast: row.breakfast,
        discountKind: row.discountKind,
        discountValue: row.discountValue,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    extras: booking.extras
      .map((row) => ({
        id: row.id,
        typeId: row.typeId,
        kind: row.kind,
        name: row.name,
        qty: row.qty,
        unitPrice: row.unitPrice,
        unit: row.unit,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function bookingChangeRequiresApproval(
  booking: Pick<
    BookingView,
    "source" | "otaPaymentMode" | "deposit" | "cashPaid" | "transferPaid" | "companyPaid" | "rooms"
  >,
  data: BookingUpdateInput,
) {
  if (data.source !== undefined && data.source !== booking.source) return true;
  if (data.otaPaymentMode !== undefined && data.otaPaymentMode !== booking.otaPaymentMode) return true;
  if (data.deposit !== undefined && data.deposit !== booking.deposit) return true;
  if (data.cashPaid !== undefined && data.cashPaid !== booking.cashPaid) return true;
  if (data.transferPaid !== undefined && data.transferPaid !== booking.transferPaid) return true;
  if (data.companyPaid !== undefined && data.companyPaid !== booking.companyPaid) return true;
  const roomById = new Map(booking.rooms.map((row) => [row.id, row]));
  return data.assignments.some((assignment) => {
    const current = roomById.get(assignment.saleId);
    if (!current) return true;
    return (
      assignment.roomId !== current.roomId ||
      (assignment.checkIn !== undefined && assignment.checkIn !== current.checkIn) ||
      (assignment.checkOut !== undefined && assignment.checkOut !== current.checkOut) ||
      (assignment.breakfast !== undefined && assignment.breakfast !== current.breakfast) ||
      (assignment.discountKind !== undefined && assignment.discountKind !== current.discountKind) ||
      (assignment.discountValue !== undefined && assignment.discountValue !== current.discountValue)
    );
  });
}

function updateSummary(booking: BookingView, data: BookingUpdateInput) {
  const labels = new Set<string>();
  const roomById = new Map(booking.rooms.map((row) => [row.id, row]));
  for (const assignment of data.assignments) {
    const current = roomById.get(assignment.saleId);
    if (!current) continue;
    if (assignment.roomId !== current.roomId) labels.add("đổi phòng");
    if (assignment.checkIn !== current.checkIn || assignment.checkOut !== current.checkOut) labels.add("đổi ngày ở");
    if (assignment.breakfast !== current.breakfast) labels.add("sửa ăn sáng");
    if (
      assignment.discountKind !== current.discountKind ||
      assignment.discountValue !== current.discountValue
    ) {
      labels.add("sửa chiết khấu");
    }
  }
  if (data.deposit !== undefined && data.deposit !== booking.deposit) labels.add("điều chỉnh tiền đã thu");
  if (data.source !== undefined && data.source !== booking.source) labels.add("đổi nguồn booking");
  if (data.otaPaymentMode !== undefined && data.otaPaymentMode !== booking.otaPaymentMode) labels.add("đổi công nợ OTA");
  return labels.size ? [...labels].join(" · ") : "sửa thông tin booking";
}

async function createRequest(
  user: SessionUser,
  booking: BookingView,
  kind: ApprovalKind,
  summary: string,
  payload: RequestPayload,
) {
  const db = await getDb();
  const pending = (
    await db
      .select({ id: t.bookingChangeRequests.id })
      .from(t.bookingChangeRequests)
      .where(
        and(
          eq(t.bookingChangeRequests.bookingId, booking.id),
          eq(t.bookingChangeRequests.status, "pending"),
        ),
      )
      .limit(1)
  )[0];
  if (pending) throw new Error("Booking đang có một đề nghị chờ quản lý duyệt");
  const id = nid();
  const requestedAt = nowISO();
  await db.insert(t.bookingChangeRequests).values({
    id,
    bookingId: booking.id,
    kind,
    status: "pending",
    summary,
    beforeJson: JSON.stringify(snapshotBooking(booking)),
    payloadJson: JSON.stringify(payload),
    proposedJson: JSON.stringify({ summary }),
    requestedBy: user.id,
    requestedAt,
  });
  await audit(user.id, "booking", booking.id, "request", undefined, { requestId: id, summary });
  await notify({
    role: "manager",
    title: `Cần duyệt sửa booking · ${booking.guestName}`,
    body: `${user.fullName} · ${summary}`,
    link: `/sales/bookings/${booking.id}`,
  });
  return { mode: "requested" as const, bookingId: booking.id, requestId: id };
}

export async function submitBookingUpdate(user: SessionUser, bookingId: string, data: BookingUpdateInput) {
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  if (user.role === "manager" || !bookingChangeRequiresApproval(booking, data)) {
    await updateBooking(user, bookingId, data);
    return { mode: "applied" as const, bookingId: booking.id };
  }
  return createRequest(user, booking, "booking_update", updateSummary(booking, data), {
    kind: "booking_update",
    data,
  });
}

export async function submitGanttMove(
  user: SessionUser,
  data: { saleId: string; roomId: string; checkIn: string; checkOut: string },
) {
  if (user.role === "manager") {
    const bookingId = await moveGanttSale(user, data);
    return { mode: "applied" as const, bookingId };
  }
  const booking = await getBooking(data.saleId);
  if (!booking) throw new Error("Không tìm thấy booking");
  return createRequest(user, booking, "move_room", "đổi phòng hoặc ngày ở trên sơ đồ", {
    kind: "move_room",
    data,
  });
}

export async function submitAddRooms(user: SessionUser, saleId: string, roomIds: string[]) {
  if (user.role === "manager") {
    const created = await addRoomsToBooking(user, saleId, roomIds);
    return { mode: "applied" as const, bookingId: created.bookingId };
  }
  const booking = await getBooking(saleId);
  if (!booking) throw new Error("Không tìm thấy booking");
  return createRequest(user, booking, "add_rooms", `thêm ${roomIds.length} phòng`, {
    kind: "add_rooms",
    saleId,
    roomIds,
  });
}

export async function submitAddExtra(
  user: SessionUser,
  bookingId: string,
  data: SaleExtraDraft,
) {
  if (user.role === "manager") {
    const id = await addBookingExtra(user, bookingId, data);
    return { mode: "applied" as const, bookingId: id };
  }
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  return createRequest(user, booking, "add_extra", `thêm phụ thu ${data.name?.trim() || "theo danh mục"}`, {
    kind: "add_extra",
    data,
  });
}

export async function submitRemoveExtra(
  user: SessionUser,
  bookingId: string,
  extraId: string,
) {
  if (user.role === "manager") {
    const id = await removeBookingExtra(user, extraId);
    return { mode: "applied" as const, bookingId: id };
  }
  const booking = await getBooking(bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  const extra = booking.extras.find((row) => row.id === extraId);
  if (!extra) throw new Error("Không tìm thấy dịch vụ");
  return createRequest(user, booking, "remove_extra", `xóa phụ thu ${extra.name}`, {
    kind: "remove_extra",
    extraId,
  });
}

function parsePayload(raw: string) {
  return JSON.parse(raw) as RequestPayload;
}

async function markConflict(
  user: SessionUser,
  request: typeof t.bookingChangeRequests.$inferSelect,
  message: string,
) {
  const db = await getDb();
  const reviewedAt = nowISO();
  await db
    .update(t.bookingChangeRequests)
    .set({ status: "conflicted", reviewedBy: user.id, reviewedAt, reviewNote: message })
    .where(eq(t.bookingChangeRequests.id, request.id));
  await audit(user.id, "booking", request.bookingId, "conflict", undefined, {
    requestId: request.id,
    summary: request.summary,
    reason: message,
  });
}

export async function approveBookingChange(user: SessionUser, requestId: string) {
  if (!can(user.role, "approveBookingChange")) throw new Error("Chỉ quản lý duyệt sửa booking");
  const db = await getDb();
  const request = (
    await db
      .select()
      .from(t.bookingChangeRequests)
      .where(eq(t.bookingChangeRequests.id, requestId))
      .limit(1)
  )[0];
  if (!request) throw new Error("Không tìm thấy đề nghị");
  if (request.status !== "pending") throw new Error("Đề nghị này đã được xử lý");
  const booking = await getBooking(request.bookingId);
  if (!booking) throw new Error("Không tìm thấy booking");
  if (!same(snapshotBooking(booking), JSON.parse(request.beforeJson))) {
    const message = "Booking đã thay đổi sau khi gửi đề nghị; cần tạo đề nghị mới";
    await markConflict(user, request, message);
    throw new Error(message);
  }
  try {
    const payload = parsePayload(request.payloadJson);
    if (payload.kind === "booking_update") await updateBooking(user, request.bookingId, payload.data);
    if (payload.kind === "move_room") await moveGanttSale(user, payload.data);
    if (payload.kind === "add_rooms") await addRoomsToBooking(user, payload.saleId, payload.roomIds);
    if (payload.kind === "add_extra") await addBookingExtra(user, request.bookingId, payload.data);
    if (payload.kind === "remove_extra") await removeBookingExtra(user, payload.extraId);
  } catch (error) {
    const message = (error as Error).message || "Không thể áp dụng đề nghị";
    await markConflict(user, request, message);
    throw error;
  }
  const reviewedAt = nowISO();
  await db
    .update(t.bookingChangeRequests)
    .set({
      status: "approved",
      reviewedBy: user.id,
      reviewedAt,
      appliedAt: reviewedAt,
    })
    .where(eq(t.bookingChangeRequests.id, request.id));
  await audit(user.id, "booking", request.bookingId, "approve", undefined, {
    requestId: request.id,
    summary: request.summary,
  });
  await notify({
    userId: request.requestedBy,
    title: "Đề nghị sửa booking đã được duyệt",
    body: `${user.fullName} · ${request.summary}`,
    link: `/sales/bookings/${request.bookingId}`,
  });
  return request.bookingId;
}

export async function rejectBookingChange(user: SessionUser, requestId: string, note: string) {
  if (!can(user.role, "approveBookingChange")) throw new Error("Chỉ quản lý duyệt sửa booking");
  const reason = note.trim();
  if (!reason) throw new Error("Nhập lý do từ chối");
  const db = await getDb();
  const request = (
    await db
      .select()
      .from(t.bookingChangeRequests)
      .where(eq(t.bookingChangeRequests.id, requestId))
      .limit(1)
  )[0];
  if (!request) throw new Error("Không tìm thấy đề nghị");
  if (request.status !== "pending") throw new Error("Đề nghị này đã được xử lý");
  const reviewedAt = nowISO();
  await db
    .update(t.bookingChangeRequests)
    .set({
      status: "rejected",
      reviewedBy: user.id,
      reviewedAt,
      reviewNote: reason,
    })
    .where(eq(t.bookingChangeRequests.id, request.id));
  await audit(user.id, "booking", request.bookingId, "reject", undefined, {
    requestId: request.id,
    summary: request.summary,
    reason,
  });
  await notify({
    userId: request.requestedBy,
    title: "Đề nghị sửa booking bị từ chối",
    body: `${user.fullName} · ${reason}`,
    link: `/sales/bookings/${request.bookingId}`,
  });
  return request.bookingId;
}

export async function listBookingChangeRequests(bookingId: string) {
  const booking = await getBooking(bookingId);
  const key = booking?.id || bookingId;
  const db = await getDb();
  const [rows, users] = await Promise.all([
    db
      .select()
      .from(t.bookingChangeRequests)
      .where(eq(t.bookingChangeRequests.bookingId, key))
      .orderBy(desc(t.bookingChangeRequests.requestedAt)),
    listUsers(),
  ]);
  const names = new Map(users.map((person) => [person.id, person.fullName]));
  return rows.map((row) => ({
    ...row,
    requestedByName: names.get(row.requestedBy) || row.requestedBy,
    reviewedByName: row.reviewedBy ? names.get(row.reviewedBy) || row.reviewedBy : null,
  }));
}
