import { auditActorName } from "@/lib/audit-view/view";
import { breakfastDay } from "@/lib/breakfast-report";
import { addDaysVN, todayVN } from "@/lib/datetime";
import { listRooms, listRoomTypes } from "@/lib/repos/rooms";
import { listBookingLogs } from "@/lib/repos/sales/logs";
import { getBooking, listBookings, listRoomSales } from "@/lib/repos/sales/queries";
import { listUsers } from "@/lib/repos/users";
import { sendZaloToGroup } from "@/lib/zalo-client";
import { claimZaloSchedule, loadZaloGroups, loadZaloMessages, zaloChannel } from "@/lib/zalo-session";
import { scheduleIsDue, type ZaloMessageEvent } from "@/lib/zalo-messages";
import {
  bookingEditSummary,
  bookingZaloVars,
  breakfastZaloVars,
  receptionDigest,
  receptionZaloVars,
  renderZaloTemplate,
  zaloOutbound,
  zaloRoomCategories,
  type ZaloChannelKey,
} from "@/lib/zalo-templates";

export async function sendZaloChannel(actorId: string, key: ZaloChannelKey, vars: Record<string, string | number>) {
  const channel = await zaloChannel(key);
  if (!channel.groupId) return { sent: false as const, channel };
  const message = zaloOutbound(renderZaloTemplate(channel.template, vars));
  await sendZaloToGroup(actorId, channel.groupId, message);
  return { sent: true as const, channel, message };
}

async function staffName(userId: string) {
  if (!userId) return "—";
  const person = (await listUsers()).find((item) => item.id === userId);
  return auditActorName(userId, person?.fullName);
}

async function recentEditText(bookingId: string, actorId: string) {
  const [logs, rooms] = await Promise.all([listBookingLogs(bookingId), listRooms()]);
  const edits = logs.filter((row) => row.actorId === actorId && row.action !== "create" && row.changes.length);
  if (!edits.length) return "";
  const newest = new Date(edits[0].createdAt).getTime();
  const burst = edits.filter((row) => newest - new Date(row.createdAt).getTime() < 15_000);
  const seen = new Set<string>();
  const changes = [];
  for (const row of burst) {
    for (const change of row.changes) {
      const stamp = `${change.key}|${change.before}|${change.after}`;
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      changes.push(change);
    }
  }
  const numbers = Object.fromEntries(rooms.map((room) => [room.id, room.number]));
  return bookingEditSummary(changes, numbers);
}

export async function dispatchBookingZalo(actorId: string, event: ZaloMessageEvent, bookingId: string) {
  const booking = await getBooking(bookingId);
  if (!booking) return;
  const first = [...booking.rooms].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const creatorId = first?.createdBy || actorId;
  const editorId = event === "booking_updated" ? actorId : "";
  const [createdBy, editedBy, edits] = await Promise.all([
    staffName(creatorId),
    staffName(editorId),
    event === "booking_updated" ? recentEditText(bookingId, actorId) : Promise.resolve(""),
  ]);
  const vars = bookingZaloVars({
    code: booking.pmsCode || booking.id,
    guest: booking.guestName,
    rooms: booking.roomLabel,
    hang: zaloRoomCategories(booking.rooms),
    invoice: Boolean(booking.invoiceRequested),
    createdBy,
    editedBy,
    edited: edits,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    due: booking.due,
  });
  const [messages, groups] = await Promise.all([loadZaloMessages(), loadZaloGroups()]);
  for (const message of messages) {
    if (!message.enabled || message.kind !== "trigger" || message.event !== event) continue;
    const group = groups.find((item) => item.slot === message.group);
    if (!group?.groupId) continue;
    await sendZaloToGroup(actorId, group.groupId, renderZaloTemplate(message.template, vars)).catch((error) => {
      console.error("zalo booking", error);
    });
  }
}

export async function receptionNoticeVars(date = todayVN()) {
  const bookings = await listBookings();
  return receptionZaloVars(receptionDigest(bookings, date), date);
}

export async function breakfastNoticeVars(date = todayVN()) {
  const [sales, types] = await Promise.all([listRoomSales(), listRoomTypes()]);
  return breakfastZaloVars(breakfastDay(sales, date, types));
}

async function scheduleVars(messageId: string, date: string) {
  if (messageId === "daily-breakfast") return breakfastNoticeVars(date);
  if (messageId === "daily-reception") return receptionNoticeVars(date);
  return { noiDung: messageId };
}

export async function sendReceptionZalo(actorId: string, date = todayVN()) {
  return sendZaloChannel(actorId, "reception", await receptionNoticeVars(date));
}

export async function runDueZaloSchedules(now = new Date()) {
  const [messages, groups] = await Promise.all([loadZaloMessages(), loadZaloGroups()]);
  const sent: string[] = [];
  for (const message of messages) {
    if (!scheduleIsDue(message, now)) continue;
    const group = groups.find((item) => item.slot === message.group);
    if (!group?.groupId) continue;
    const claimed = await claimZaloSchedule(message.id, todayVN(now));
    if (!claimed) continue;
    const vars = await scheduleVars(message.id, todayVN(now));
    await sendZaloToGroup("zalo-cron", group.groupId, renderZaloTemplate(message.template, vars));
    sent.push(message.id);
  }
  return sent;
}

export async function sendMessagePreview(actorId: string, messageId: string) {
  const [messages, groups] = await Promise.all([loadZaloMessages(), loadZaloGroups()]);
  const message = messages.find((item) => item.id === messageId);
  if (!message) throw new Error("Không có tin này.");
  const group = groups.find((item) => item.slot === message.group);
  if (!group?.groupId) throw new Error("Chọn nhóm nhận cho tin này trước khi gửi thử.");
  const today = todayVN();
  const vars =
    message.kind === "schedule"
      ? await scheduleVars(message.id, today)
      : bookingZaloVars({
          code: "TEST",
          guest: "Khách thử",
          rooms: "P.101",
          hang: "Deluxe",
          invoice: true,
          createdBy: "Minh Quản lý",
          editedBy: "Ngân Lễ tân",
          edited: "Ngày nhận phòng: 29/09/2026 → 30/09/2026",
          checkIn: today,
          checkOut: addDaysVN(today, 1),
          due: 1500000,
        });
  await sendZaloToGroup(actorId, group.groupId, renderZaloTemplate(message.template, vars));
  return { groupId: group.groupId, name: message.name };
}

export async function sendChannelPreview(actorId: string, key: ZaloChannelKey) {
  if (key === "booking") {
    const today = todayVN();
    return sendZaloChannel(
      actorId,
      "booking",
      bookingZaloVars({
        code: "TEST",
        guest: "Khách thử",
        rooms: "P.101",
        hang: "Deluxe",
        invoice: true,
        createdBy: "Minh Quản lý",
        editedBy: "Ngân Lễ tân",
        edited: "",
        checkIn: today,
        checkOut: addDaysVN(today, 1),
        due: 1500000,
      }),
    );
  }
  if (key === "reception") return sendReceptionZalo(actorId);
  return sendZaloChannel(actorId, "task", { noiDung: "Đây là tin thử từ trang việc." });
}
