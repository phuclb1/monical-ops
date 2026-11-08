import { Agent, routeAgentEmail } from "agents";
import { createAddressBasedEmailResolver, type AgentEmail } from "agents/email";
import PostalMime from "postal-mime";
import {
  askText,
  cancelText,
  createOpsBooking,
  createdText,
  existingOpsBooking,
  exactCatalogType,
  extractBooking,
  extractBookingWithModel,
  isBookingMail,
  isCancelBooking,
  isNewBooking,
  offerRoomsText,
  pickedText,
  replyAction,
  roomCatalog,
  suggestCatalogTypes,
  type BookingDraft,
} from "./booking";
import {
  answerCallback,
  forwardMessage,
  isStartCommand,
  isStopCommand,
  plainText,
  sameSecret,
  sendTelegram,
} from "./telegram";

type ChatRow = { chat_id: string };
type DraftRow = { id: string; chat_id: string; status: string; payload: string };

const STARTED = "Đã bật thông báo. Chỉ mail booking mới hoặc huỷ gửi tới agent@monicalhoteldalat.com mới được nhắn vào đây.";

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number } };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number } };
  };
};

export class EmailAgent extends Agent<Env> {
  async onEmail(email: AgentEmail) {
    const parsed = await PostalMime.parse(await email.getRaw());
    const subject = parsed.subject ?? "";
    const text = plainText(parsed.text, parsed.html);
    const mail = { subject, text };
    const kind = isCancelBooking(mail) ? "cancel" : isNewBooking(mail) ? "new" : "skip";
    console.log(JSON.stringify({ from: email.from, to: email.to, subject, kind }));
    if (!isBookingMail(mail)) return;
    const chatId = this.env.TELEGRAM_CHAT_ID || this.chatIds()[0] || "";
    if (!this.env.TELEGRAM_BOT_TOKEN || !chatId) {
      console.log("telegram: chưa có chat.");
      return;
    }
    if (kind === "cancel") {
      const draft = extractBooking(mail);
      if (!draft) return;
      const existing = await existingOpsBooking(this.env.OPS_OPEN_API_TOKEN || "", draft.pmsCode);
      await this.notify(chatId, cancelText(draft, existing));
      return;
    }
    const extracted = extractBooking(mail);
    const draft = this.env.OPENAI_API_KEY
      ? await extractBookingWithModel(mail, this.env.OPENAI_API_KEY, extracted).catch(() => extracted)
      : extracted;
    if (!draft?.guestName || !draft.checkIn || !draft.checkOut) {
      await this.notify(chatId, forwardMessage({ from: email.from, to: email.to, subject, text }));
      return;
    }
    const existing = await existingOpsBooking(this.env.OPS_OPEN_API_TOKEN || "", draft.pmsCode);
    if (existing) {
      await this.notify(chatId, `Booking ${draft.pmsCode} đã có trên Ops: ${existing}`);
      return;
    }
    const open = this.openDraft(chatId);
    if (open?.pmsCode === draft.pmsCode) {
      await this.notify(chatId, `Đang chờ xác nhận booking ${draft.pmsCode}.`);
      return;
    }
    draft.id = crypto.randomUUID().slice(0, 8);
    this.saveDraft(chatId, "ask", draft);
    await this.notify(chatId, askText(draft), [
      [
        { text: "Check phòng trống", data: `c:${draft.id}` },
        { text: "Không cần check", data: `s:${draft.id}` },
      ],
      [{ text: "Huỷ", data: `n:${draft.id}` }],
    ]);
  }

  async handleTelegram(update: TelegramUpdate) {
    const callback = update.callback_query;
    if (callback?.id && this.env.TELEGRAM_BOT_TOKEN) await answerCallback(this.env.TELEGRAM_BOT_TOKEN, callback.id);
    const chatId = callback?.message?.chat?.id || update.message?.chat?.id;
    const text = update.message?.text || "";
    if (!chatId || !this.env.TELEGRAM_BOT_TOKEN) return;
    const target = String(chatId);
    if (isStartCommand(text)) {
      await this.rememberChat(chatId);
      await this.notify(target, STARTED);
      return;
    }
    if (isStopCommand(text)) {
      await this.forgetChat(chatId);
      await this.notify(target, "Đã tắt thông báo email.");
      return;
    }
    const data = callback?.data || "";
    const action = data ? data.slice(0, 1) : replyAction(text);
    const draftId = data.includes(":") ? data.split(":")[1] : this.openDraft(target)?.id || "";
    const draft = draftId ? this.draftById(draftId) : this.openDraft(target);
    if (!draft) return;
    if (action === "c" || action === "check") await this.checkDraft(target, draft);
    else if (action === "s" || action === "skip") await this.askRoom(target, draft);
    else if (action === "p") await this.useRoom(target, draft, data.split(":")[2] || "");
    else if (action === "room") await this.useRoom(target, draft, text.trim());
    else if (action === "y" || action === "create") await this.createDraft(target, draft);
    else if (action === "n" || action === "cancel") {
      this.setStatus(draft.id, "cancelled");
      await this.notify(target, `Đã huỷ draft ${draft.pmsCode || draft.guestName}.`);
    }
  }

  async rememberChat(chatId: number) {
    this.ensureChats();
    this.sql`INSERT OR REPLACE INTO telegram_chats (chat_id) VALUES (${String(chatId)})`;
  }

  async forgetChat(chatId: number) {
    this.ensureChats();
    this.sql`DELETE FROM telegram_chats WHERE chat_id = ${String(chatId)}`;
  }

  private async checkDraft(chatId: string, draft: BookingDraft) {
    if (!draft.checkIn || !draft.checkOut) {
      await this.notify(chatId, "Thiếu ngày nhận hoặc trả, chưa check được phòng.");
      return;
    }
    const catalog = await roomCatalog(this.env.OPS_OPEN_API_TOKEN || "", draft.checkIn, draft.checkOut);
    if (!catalog.ok) {
      await this.notify(chatId, catalog.error);
      return;
    }
    const exact = exactCatalogType(draft.roomType, catalog.types);
    const otaType = draft.roomType;
    let chosen = exact ? [exact] : [];
    let note = "";
    if (exact) {
      draft.roomType = exact.type;
    } else {
      const names = await suggestCatalogTypes(this.env.OPENAI_API_KEY || "", otaType, catalog.types);
      const byName = new Map(catalog.types.map((row) => [row.type.toUpperCase(), row]));
      chosen = names.map((name) => byName.get(name.toUpperCase())).filter((row) => Boolean(row));
      note = `OTA ghi "${otaType || "(không rõ)"}". Không có hạng đúng tên trên Ops.${chosen.length ? ` Đề xuất: ${chosen.map((row) => row.type).join(", ")}.` : ""}`;
    }
    const picks = chosen.flatMap((row) => row.rooms.map((room) => ({ room, type: row.type, label: exact ? room : `${row.type} ${room}` })));
    draft.roomNumber = "";
    draft.roomTypeByNumber = Object.fromEntries(picks.map((row) => [row.room, row.type]));
    this.saveDraft(chatId, picks.length ? "pick" : "room", draft);
    await this.notify(
      chatId,
      offerRoomsText(draft, chosen.map((row) => ({ type: row.type, rooms: row.rooms })), note),
      this.roomButtons(draft.id, picks),
    );
  }

  private async askRoom(chatId: string, draft: BookingDraft) {
    this.saveDraft(chatId, "room", draft);
    await this.notify(chatId, `${offerRoomsText(draft, [])}\nTrả lời số phòng nếu muốn gắn vào draft.`);
  }

  private async useRoom(chatId: string, draft: BookingDraft, roomNumber: string) {
    if (!roomNumber) return;
    const mapped = draft.roomTypeByNumber?.[roomNumber];
    if (mapped) draft.roomType = mapped;
    draft.roomNumber = roomNumber;
    this.saveDraft(chatId, "confirm", draft);
    await this.notify(chatId, pickedText(draft), [
      [
        { text: "Tạo trên Ops", data: `y:${draft.id}` },
        { text: "Chọn phòng khác", data: `c:${draft.id}` },
      ],
      [{ text: "Huỷ", data: `n:${draft.id}` }],
    ]);
  }

  private async createDraft(chatId: string, draft: BookingDraft) {
    if (!draft.roomNumber) {
      await this.notify(chatId, "Chưa có số phòng. Check phòng trống hoặc trả lời số phòng.");
      return;
    }
    const token = this.env.OPS_OPEN_API_TOKEN || "";
    if (!token) {
      await this.notify(chatId, "Chưa có token Open API của Ops, chưa tạo được booking.");
      return;
    }
    try {
      const existing = await existingOpsBooking(token, draft.pmsCode);
      if (existing) {
        this.setStatus(draft.id, "done");
        await this.notify(chatId, `Booking ${draft.pmsCode} đã có trên Ops: ${existing}`);
        return;
      }
      const id = await createOpsBooking(token, draft);
      this.setStatus(draft.id, "done");
      await this.notify(chatId, createdText(draft, id));
    } catch (error) {
      await this.notify(chatId, `Chưa tạo được booking: ${error instanceof Error ? error.message : "lỗi Ops"}`);
    }
  }

  private roomButtons(id: string, picks: { room: string; label: string }[]) {
    const width = picks.some((row) => row.label.length > 6) ? 2 : 3;
    const rows: { text: string; data: string }[][] = [];
    for (let index = 0; index < picks.length; index += width) {
      rows.push(picks.slice(index, index + width).map((row) => ({ text: row.label, data: `p:${id}:${row.room}` })));
    }
    rows.push([{ text: "Huỷ", data: `n:${id}` }]);
    return rows;
  }

  private async notify(
    chatId: string,
    text: string,
    buttons: { text: string; data: string }[][] = [],
  ) {
    try {
      await sendTelegram(this.env.TELEGRAM_BOT_TOKEN, chatId, text, buttons);
    } catch (error) {
      console.log(`telegram: ${error instanceof Error ? error.message : "gửi thất bại"}`);
    }
  }

  private ensureChats() {
    this.sql`CREATE TABLE IF NOT EXISTS telegram_chats (chat_id TEXT PRIMARY KEY)`;
    this.sql`CREATE TABLE IF NOT EXISTS booking_drafts (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL
    )`;
  }

  private chatIds() {
    this.ensureChats();
    return this.sql<ChatRow>`SELECT chat_id FROM telegram_chats`.map((row) => row.chat_id);
  }

  private saveDraft(chatId: string, status: string, draft: BookingDraft) {
    this.ensureChats();
    const payload = JSON.stringify(draft);
    this.sql`INSERT OR REPLACE INTO booking_drafts (id, chat_id, status, payload) VALUES (${draft.id}, ${chatId}, ${status}, ${payload})`;
  }

  private setStatus(id: string, status: string) {
    this.ensureChats();
    this.sql`UPDATE booking_drafts SET status = ${status} WHERE id = ${id}`;
  }

  private openDraft(chatId: string) {
    this.ensureChats();
    const row = this.sql<DraftRow>`SELECT id, chat_id, status, payload FROM booking_drafts WHERE chat_id = ${chatId} AND status IN ('ask', 'room', 'pick', 'confirm') ORDER BY rowid DESC LIMIT 1`[0];
    return row ? this.parseDraft(row) : null;
  }

  private draftById(id: string) {
    this.ensureChats();
    const row = this.sql<DraftRow>`SELECT id, chat_id, status, payload FROM booking_drafts WHERE id = ${id} LIMIT 1`[0];
    if (!row || row.status === "done" || row.status === "cancelled") return null;
    return this.parseDraft(row);
  }

  private parseDraft(row: DraftRow) {
    const draft = JSON.parse(row.payload) as BookingDraft;
    draft.id = row.id;
    return draft;
  }
}

function agentStub(env: Env) {
  return env.EmailAgent.get(env.EmailAgent.idFromName("agent"));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/telegram") return new Response("ops-email-agent");
    const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (!env.TELEGRAM_WEBHOOK_SECRET || !sameSecret(provided, env.TELEGRAM_WEBHOOK_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const update = (await request.json()) as TelegramUpdate;
    await agentStub(env).handleTelegram(update);
    return new Response("ok");
  },
  async email(message, env) {
    await routeAgentEmail(message, env, {
      resolver: createAddressBasedEmailResolver("EmailAgent"),
    });
  },
} satisfies ExportedHandler<Env>;
