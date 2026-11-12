import { OPS_BASE } from "./booking";

export type DeskGuest = {
  id: string;
  name: string;
  room: string;
  phone: string;
  code: string;
  source: string;
  status: string;
  mark: string;
  checkIn: string;
  checkOut: string;
  total: number;
  due: number;
  flag: "" | "late" | "due-out";
};

export type DeskMoney = {
  label: string;
  count: number;
  total: number;
  direct: number;
  ota: number;
  hotelNet: number;
  due: number;
  recognized: number;
};

export type DeskBrief = {
  today: string;
  date: string;
  arrivals: DeskGuest[];
  departures: DeskGuest[];
  inhouse: DeskGuest[];
  due: DeskGuest[];
  found: DeskGuest[];
  vacantRooms: string[];
  occupancy: { rooms: number; vacant: number; reserved: number; inhouse: number; ooo: number };
  revenue: { month: DeskMoney; day: DeskMoney };
};

export type DeskIntent =
  | { kind: "none" }
  | { kind: "help" }
  | { kind: "arrivals"; date: string }
  | { kind: "departures"; date: string }
  | { kind: "inhouse" }
  | { kind: "revenue"; when: "month" | "today" | "yesterday" }
  | { kind: "vacant" }
  | { kind: "due" }
  | { kind: "summary" }
  | { kind: "find"; query: string };

export function todayInVietnam(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

export function shiftDate(iso: string, days: number) {
  const utc = new Date(`${iso}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function foldDeskText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

function whenOf(text: string, today: string) {
  if (/ngay mai|\bmai\b/.test(text) && !/hom nay/.test(text)) return shiftDate(today, 1);
  if (/hom qua/.test(text)) return shiftDate(today, -1);
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const dmy = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20\d{2}))?\b/);
  if (!dmy) return today;
  const year = dmy[3] || today.slice(0, 4);
  return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
}

function revenueIntent(text: string): DeskIntent {
  if (/hom qua/.test(text)) return { kind: "revenue", when: "yesterday" };
  if (/thang/.test(text)) return { kind: "revenue", when: "month" };
  if (/hom nay|ngay nay/.test(text)) return { kind: "revenue", when: "today" };
  return { kind: "revenue", when: "month" };
}

function parseList(rest: string, today: string): DeskIntent {
  if (/chua|dang o|inhouse|stay/.test(rest)) return { kind: "inhouse" };
  if (/doanh thu|revenue|^dt\b/.test(rest)) return revenueIntent(rest);
  if (/out|tra phong|checkout/.test(rest)) return { kind: "departures", date: whenOf(rest, today) };
  if (/trong|empty/.test(rest)) return { kind: "vacant" };
  if (/\bno\b|cong no|due/.test(rest)) return { kind: "due" };
  return { kind: "arrivals", date: whenOf(rest, today) };
}

function parseChat(folded: string, original: string, today: string): DeskIntent {
  if (/^tim\b|^find\b/.test(folded)) {
    const query = original.replace(/^(?:tìm|tim|find)\s+(?:khách|khach|phòng|phong)?\s*/i, "").trim();
    return query ? { kind: "find", query } : { kind: "help" };
  }
  if (/chua\s*check\s*out|chua\s*checkout|chua\s*tra|chua\s*ra|khach\s*chua|dang o|chua check-out/.test(folded)) {
    return { kind: "inhouse" };
  }
  if (/doanh thu|doanhthu|revenue|doanh so|tien thang/.test(folded)) return revenueIntent(folded);
  if (/phong trong|con phong|empty room|phong nao trong|con trong/.test(folded)) return { kind: "vacant" };
  if (/con no|cong no|chua thu|chua tra tien|khach no/.test(folded)) return { kind: "due" };
  if (/tom tat|hom nay the nao|bao cao hom nay|tinh hinh|ca hom nay|hom nay sao/.test(folded)) return { kind: "summary" };
  const room = folded.match(/phong\s*(\d{2,4})/);
  if (room) return { kind: "find", query: room[1] };
  if (/^\d{2,4}$/.test(folded)) return { kind: "find", query: folded };
  const departure = /tra phong|check\s*out|checkout|\bout\b/.test(folded);
  const arrival = /\bin\b|check\s*in|checkin|nhan phong|khach den|khach toi|list/.test(folded);
  if (departure && !arrival) return { kind: "departures", date: whenOf(folded, today) };
  if (arrival && /in|check|nhan|den|toi|list/.test(folded)) return { kind: "arrivals", date: whenOf(folded, today) };
  return { kind: "none" };
}

export function parseDeskAsk(raw: string, today = todayInVietnam()): DeskIntent {
  const text = raw.trim();
  if (!text) return { kind: "none" };
  const folded = foldDeskText(text);
  if (/^(help|tro giup|menu)$/.test(folded)) return { kind: "help" };
  const command = text.match(/^\/([a-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!command) return parseChat(folded, text, today);
  const name = command[1].toLowerCase();
  const rest = foldDeskText(command[2] || "");
  if (name === "start" || name === "stop") return { kind: "none" };
  if (name === "help") return { kind: "help" };
  if (name === "tim" || name === "find") {
    const query = (command[2] || "").trim();
    return query ? { kind: "find", query } : { kind: "help" };
  }
  if (name === "list") return parseList(rest, today);
  if (name === "in" || name === "checkin") return { kind: "arrivals", date: whenOf(rest, today) };
  if (name === "out" || name === "checkout") return { kind: "departures", date: whenOf(rest, today) };
  if (name === "stay" || name === "inhouse") return { kind: "inhouse" };
  if (name === "dt" || name === "revenue" || name === "doanhthu") return revenueIntent(rest);
  if (name === "today" || name === "homnay") return { kind: "summary" };
  if (name === "trong" || name === "empty") return { kind: "vacant" };
  if (name === "no" || name === "due" || name === "congno") return { kind: "due" };
  return { kind: "none" };
}

export function deskButtonIntent(data: string, today = todayInVietnam()): DeskIntent | null {
  if (!data.startsWith("desk:")) return null;
  const key = data.slice(5);
  const command: Record<string, string> = {
    in: "/list",
    out: "/out",
    stay: "/stay",
    dt: "/dt",
    today: "/today",
    trong: "/trong",
    no: "/no",
    help: "/help",
  };
  return parseDeskAsk(command[key] || "/help", today);
}

export function deskQueryDate(intent: DeskIntent, today: string) {
  if (intent.kind === "arrivals" || intent.kind === "departures") return intent.date;
  if (intent.kind === "revenue" && intent.when === "yesterday") return shiftDate(today, -1);
  return today;
}

export function deskMenu() {
  return [
    [
      { text: "In hôm nay", data: "desk:in" },
      { text: "Chưa out", data: "desk:stay" },
    ],
    [
      { text: "Trả hôm nay", data: "desk:out" },
      { text: "Doanh thu", data: "desk:dt" },
    ],
    [
      { text: "Hôm nay", data: "desk:today" },
      { text: "Phòng trống", data: "desk:trong" },
    ],
  ];
}

export function shouldOfferDeskHelp(text: string) {
  const folded = foldDeskText(text);
  if (folded.startsWith("/")) return true;
  return /[?]/.test(text) || /khach|phong|doanh|list|bao nhieu|hom nay|tra phong|check|tien|cong no|trong/.test(folded);
}

export function deskHelp() {
  return [
    "Hỏi như đang nhắn lễ tân. Ví dụ:",
    "• /list hoặc in hôm nay",
    "• khách chưa check out",
    "• trả phòng hôm nay / ngày mai",
    "• doanh thu tháng này",
    "• doanh thu hôm nay",
    "• phòng trống",
    "• khách còn nợ",
    "• hôm nay thế nào",
    "• tìm Lan / phòng 305",
  ].join("\n");
}

export function formatDong(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat("vi-VN").format(Math.abs(Math.round(value)))}₫`;
}

function dayLabel(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function stay(guest: DeskGuest) {
  return `${dayLabel(guest.checkIn)}–${dayLabel(guest.checkOut)}`;
}

function dueNote(guest: DeskGuest) {
  return guest.due > 0 ? ` · còn ${formatDong(guest.due)}` : "";
}

function flagNote(guest: DeskGuest) {
  if (guest.flag === "late") return ` · quá hạn ${dayLabel(guest.checkOut)}`;
  if (guest.flag === "due-out") return " · trả hôm nay";
  return "";
}

function lines(guests: DeskGuest[], line: (guest: DeskGuest) => string) {
  const shown = guests.slice(0, 35).map((guest) => `• ${line(guest)}`);
  if (guests.length > 35) shown.push(`• … và ${guests.length - 35} khách nữa`);
  return shown.join("\n");
}

function moneyText(money: DeskMoney, heading: string) {
  return [
    heading,
    `Ròng về KS: ${formatDong(money.hotelNet)}`,
    `Tổng ${formatDong(money.total)} · trực tiếp ${formatDong(money.direct)} · OTA ${formatDong(money.ota)}`,
    `${money.count} booking theo ngày nhận · đã tới ngày nhận ${formatDong(money.recognized)}`,
    `Khách còn phải thu: ${formatDong(money.due)}`,
  ].join("\n");
}

export function formatDesk(intent: DeskIntent, brief: DeskBrief) {
  if (intent.kind === "arrivals") {
    const title = `Khách nhận phòng ${dayLabel(brief.date)} — ${brief.arrivals.length}`;
    if (!brief.arrivals.length) return `${title}\nKhông có khách nhận phòng.`;
    return `${title}\n${lines(brief.arrivals, (guest) => `${guest.room || "—"} ${guest.name} · ${guest.mark} · ${stay(guest)}${guest.source ? ` · ${guest.source}` : ""}${dueNote(guest)}`)}`;
  }
  if (intent.kind === "departures") {
    const title = `Khách trả phòng ${dayLabel(brief.date)} — ${brief.departures.length}`;
    if (!brief.departures.length) return `${title}\nKhông có khách trả phòng.`;
    return `${title}\n${lines(brief.departures, (guest) => `${guest.room || "—"} ${guest.name} · ${guest.mark}${dueNote(guest)}`)}`;
  }
  if (intent.kind === "inhouse") {
    const title = `Khách chưa check out — ${brief.inhouse.length}`;
    if (!brief.inhouse.length) return `${title}\nKhông có khách đang ở.`;
    return `${title}\n${lines(brief.inhouse, (guest) => `${guest.room || "—"} ${guest.name}${flagNote(guest) || ` · trả ${dayLabel(guest.checkOut)}`}${dueNote(guest)}`)}`;
  }
  if (intent.kind === "revenue") {
    if (intent.when === "month") return moneyText(brief.revenue.month, `Doanh thu ${brief.revenue.month.label}`);
    const label = intent.when === "yesterday" ? "hôm qua" : "hôm nay";
    return moneyText(brief.revenue.day, `Doanh thu ${label} ${dayLabel(brief.date)}`);
  }
  if (intent.kind === "vacant") {
    const rooms = brief.vacantRooms.length ? brief.vacantRooms.join(", ") : "hết phòng";
    return `Phòng trống đêm ${dayLabel(brief.date)}: ${rooms}\nTrống ${brief.occupancy.vacant} · giữ ${brief.occupancy.reserved} · đang ở ${brief.occupancy.inhouse} · không bán ${brief.occupancy.ooo}`;
  }
  if (intent.kind === "due") {
    const title = `Khách còn nợ — ${brief.due.length}`;
    if (!brief.due.length) return `${title}\nKhông có khoản khách còn phải thu.`;
    return `${title}\n${lines(brief.due, (guest) => `${guest.room || "—"} ${guest.name} · ${formatDong(guest.due)} · ${guest.mark}`)}`;
  }
  if (intent.kind === "find") {
    const title = `Tìm “${intent.query}” — ${brief.found.length}`;
    if (!brief.found.length) return `${title}\nKhông thấy khách hoặc phòng khớp.`;
    return `${title}\n${lines(brief.found, (guest) => `${guest.room || "—"} ${guest.name} · ${guest.mark} · ${stay(guest)}${guest.phone ? ` · ${guest.phone}` : ""}${dueNote(guest)}`)}`;
  }
  if (intent.kind === "summary") {
    return [
      `Hôm nay ${dayLabel(brief.today)}`,
      `Nhận ${brief.arrivals.length} · trả ${brief.departures.length} · chưa out ${brief.inhouse.length}`,
      `Phòng trống ${brief.occupancy.vacant} · giữ ${brief.occupancy.reserved} · đang ở ${brief.occupancy.inhouse}`,
      `Doanh thu nhận hôm nay: ${formatDong(brief.revenue.day.total)}`,
      `Tháng này ròng về KS: ${formatDong(brief.revenue.month.hotelNet)}`,
      brief.due.length ? `Còn nợ: ${brief.due.length} khách · ${formatDong(brief.due.reduce((sum, guest) => sum + guest.due, 0))}` : "Không có khách còn nợ.",
    ].join("\n");
  }
  return deskHelp();
}

export async function loadDesk(token: string, date: string, query = "") {
  if (!token) return { ok: false as const, error: "Chưa có token Open API, chưa xem được số liệu." };
  const url = new URL(`${OPS_BASE}/api/open/desk`);
  if (date) url.searchParams.set("date", date);
  if (query) url.searchParams.set("q", query);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<DeskBrief>;
  if (!response.ok || !payload.ok || !payload.date || !payload.revenue) {
    return { ok: false as const, error: payload.error || `Ops HTTP ${response.status}` };
  }
  return { ok: true as const, brief: payload as DeskBrief };
}

export async function classifyDeskAsk(text: string, apiKey: string, today: string): Promise<DeskIntent> {
  const folded = foldDeskText(text);
  if (!apiKey || folded.length < 8 || folded.length > 300) return { kind: "none" };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Classify a hotel front-desk question. Return JSON only with kind, when, date, and query. kind is help, arrivals, departures, inhouse, revenue, vacant, due, summary, find, or none. when is month, today, yesterday, or tomorrow. date is YYYY-MM-DD or empty. arrivals = check-in list. departures = check-out list. inhouse = guests who have not checked out. revenue = takings. vacant = empty rooms. due = unpaid guest balances. summary = how today looks. find.query is a guest, phone, code, or room. Use none when it is not a desk question. Do not invent figures.',
        },
        { role: "user", content: `Today is ${today}. Question: ${text}` },
      ],
    }),
  });
  if (!response.ok) return { kind: "none" };
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return deskIntentFromModel(payload.choices?.[0]?.message?.content || "", today);
}

export function deskIntentFromModel(raw: string, today: string): DeskIntent {
  try {
    const parsed = JSON.parse(raw) as { kind?: string; when?: string; query?: string; date?: string };
    const kind = parsed.kind || "none";
    if (kind === "help") return { kind: "help" };
    if (kind === "inhouse" || kind === "vacant" || kind === "due" || kind === "summary") return { kind };
    if (kind === "find") {
      const query = String(parsed.query || "").trim().slice(0, 80);
      return query ? { kind: "find", query } : { kind: "help" };
    }
    if (kind === "revenue") {
      const when = parsed.when === "today" || parsed.when === "yesterday" ? parsed.when : "month";
      return { kind: "revenue", when };
    }
    if (kind === "arrivals" || kind === "departures") {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || "")
        ? parsed.date || today
        : parsed.when === "tomorrow"
          ? shiftDate(today, 1)
          : parsed.when === "yesterday"
            ? shiftDate(today, -1)
            : today;
      return { kind, date };
    }
    return { kind: "none" };
  } catch {
    return { kind: "none" };
  }
}

export async function setDeskCommands(token: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Bật thông báo" },
        { command: "list", description: "Khách nhận phòng hôm nay" },
        { command: "stay", description: "Khách chưa check out" },
        { command: "out", description: "Khách trả phòng hôm nay" },
        { command: "dt", description: "Doanh thu tháng này" },
        { command: "today", description: "Tóm tắt hôm nay" },
        { command: "trong", description: "Phòng trống đêm nay" },
        { command: "no", description: "Khách còn nợ" },
        { command: "help", description: "Cách hỏi số liệu" },
      ],
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram HTTP ${response.status}`);
}
