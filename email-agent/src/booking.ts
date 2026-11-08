export const OPS_BASE = "https://platform.monicalhoteldalat.com";

export type BookingDraft = {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  source: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  roomNumber: string;
  adults: number;
  children: number;
  rate: number;
  pmsCode: string;
  notes: string;
  breakfast: boolean;
  paymentNote: string;
  statusLabel: string;
  roomTypeByNumber: Record<string, string>;
};

type Mail = { subject: string; text: string };

function mailHead(mail: Mail) {
  return `${mail.subject}\n${mail.text.slice(0, 1200)}`;
}

export function isCancelBooking(mail: Mail) {
  return /cancel(?:led|lation)?\s+booking|booking\s+(?:has been\s+)?cancel|hủy\s+đặt\s+phòng|huỷ\s+đặt\s+phòng|đặt phòng đã (?:bị\s+)?(?:hủy|huỷ)/i.test(mailHead(mail));
}

export function isBookingChange(mail: Mail) {
  return /modif(?:y|ied|ication)|amend(?:ed)?\s+booking|thay đổi đặt phòng|sửa đặt phòng|cập nhật đặt phòng/i.test(mailHead(mail));
}

export function isNewBooking(mail: Mail) {
  if (isCancelBooking(mail) || isBookingChange(mail)) return false;
  return /new booking|mã đặt phòng/i.test(mailHead(mail));
}

export function isBookingMail(mail: Mail) {
  return isNewBooking(mail) || isCancelBooking(mail);
}

export function extractBooking(mail: Mail): BookingDraft | null {
  if (!isBookingMail(mail)) return null;
  const lines = mail.text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dates = [...mail.text.matchAll(/(\d{1,2})\s+tháng\s+(\d{1,2}),?\s+(\d{4})/gi)].map((match) =>
    isoDate(Number(match[3]), Number(match[2]), Number(match[1])),
  );
  const code = mail.text.match(/Mã đặt phòng:\s*(\S+)/)?.[1] || "";
  const codeIndex = lines.findIndex((line) => code && line.includes(code));
  const partyIndex = lines.findIndex((line) => /khách/.test(line) && /phòng/.test(line));
  const guestEmail = lines.find((line) => /@/.test(line) && !/maccaldalathotel@gmail\.com/i.test(line)) || "";
  const emailIndex = guestEmail ? lines.indexOf(guestEmail) : -1;
  const benefits = mail.text.match(/Benefits:\s*([^\n]+)/)?.[1]?.trim() || "";
  const requests = mail.text.match(/Requests:\s*([^\n]+)/)?.[1]?.trim() || "";
  const paymentNote = mail.text.match(/Payment Collect:\s*([^\n]+)/i)?.[1]?.trim() || (emailIndex >= 0 ? lines[emailIndex + 2] || "" : "");
  const roomType = lines.find((line) => /^(standard|deluxe|superior|suite|villa)\b/i.test(line)) || "";
  const adults = Number(mail.text.match(/Người lớn\s+(\d+)/)?.[1] || mail.text.match(/(\d+)\s+khách/)?.[1] || 1);
  const children = Number(mail.text.match(/Trẻ em\s+(\d+)/)?.[1] || 0);
  const rate = money(mail.text.match(/Tổng tiền:\s*([^\n]+)/)?.[1] || "");
  return {
    id: "",
    guestName: partyIndex >= 0 ? lines[partyIndex + 1] || "" : "",
    guestEmail,
    guestPhone: "",
    source: channel(emailIndex >= 0 ? lines[emailIndex + 1] || "" : mail.subject),
    checkIn: dates[0] || "",
    checkOut: dates[1] || "",
    roomType,
    roomNumber: "",
    adults: Number.isFinite(adults) && adults > 0 ? adults : 1,
    children: Number.isFinite(children) && children > 0 ? children : 0,
    rate,
    pmsCode: code,
    notes: [benefits && `Benefits: ${benefits}`, requests && `Requests: ${requests}`, paymentNote && `Thu: ${paymentNote}`]
      .filter(Boolean)
      .join("\n"),
    breakfast: /breakfast/i.test(benefits),
    paymentNote,
    statusLabel: codeIndex >= 0 ? lines[codeIndex + 1] || "" : "",
    roomTypeByNumber: {},
  };
}

export async function extractBookingWithModel(mail: Mail, apiKey: string, fallback: BookingDraft | null) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Trích booking khách sạn từ email. Chỉ trả JSON với các khóa: isNewBooking, guestName, guestEmail, guestPhone, source, checkIn, checkOut, roomType, adults, children, rate, pmsCode, breakfast, paymentNote, notes, statusLabel. checkIn và checkOut là YYYY-MM-DD. rate là số VND, không có dấu chấm. source là agoda, booking, traveloka, expedia, airbnb, ezcloud hoặc ota. isNewBooking là true khi đây là đặt phòng mới.",
        },
        { role: "user", content: `Tiêu đề: ${mail.subject}\n\n${mail.text.slice(0, 6000)}` },
      ],
    }),
  });
  if (!response.ok) return fallback;
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = payload.choices?.[0]?.message?.content || "";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fallback;
  }
  if (parsed.isNewBooking === false) return null;
  const base = fallback || emptyDraft();
  return {
    ...base,
    guestName: text(parsed.guestName) || base.guestName,
    guestEmail: text(parsed.guestEmail) || base.guestEmail,
    guestPhone: text(parsed.guestPhone) || base.guestPhone,
    source: channel(text(parsed.source) || base.source),
    checkIn: dateOr(text(parsed.checkIn), base.checkIn),
    checkOut: dateOr(text(parsed.checkOut), base.checkOut),
    roomType: text(parsed.roomType) || base.roomType,
    adults: numberOr(parsed.adults, base.adults || 1),
    children: numberOr(parsed.children, base.children),
    rate: numberOr(parsed.rate, base.rate),
    pmsCode: text(parsed.pmsCode) || base.pmsCode,
    notes: text(parsed.notes) || base.notes,
    breakfast: typeof parsed.breakfast === "boolean" ? parsed.breakfast : base.breakfast,
    paymentNote: text(parsed.paymentNote) || base.paymentNote,
    statusLabel: text(parsed.statusLabel) || base.statusLabel,
  };
}

export function askText(draft: BookingDraft) {
  return `${draftText(draft)}\n\nCó cần check phòng trống trên Ops trước không?`;
}

export function cancelText(draft: BookingDraft, opsId = "") {
  return [
    "Huỷ booking",
    `Khách: ${draft.guestName || "(chưa rõ)"}`,
    `Mã: ${draft.pmsCode || "(chưa rõ)"}`,
    `Kênh: ${draft.source || "(chưa rõ)"}`,
    `Nhận: ${draft.checkIn || "?"} → Trả: ${draft.checkOut || "?"}`,
    `Hạng: ${draft.roomType || "(chưa rõ)"}`,
    opsId ? `Ops: ${OPS_BASE}/sales/bookings/${opsId}` : "Chưa thấy booking này trên Ops.",
  ].join("\n");
}

export function offerRoomsText(draft: BookingDraft, groups: { type: string; rooms: string[] }[], note = "") {
  const lines = groups.map((group) => `${group.type}: ${group.rooms.length ? group.rooms.join(", ") : "hết"}`);
  const canPick = groups.some((group) => group.rooms.length);
  return [draftText(draft), note, ...lines, canPick ? "Chọn một phòng để sửa draft." : ""]
    .filter(Boolean)
    .join("\n");
}

export function pickedText(draft: BookingDraft) {
  return `${draftText(draft)}\nĐã gắn phòng ${draft.roomNumber} vào draft.`;
}

export function createdText(draft: BookingDraft, id: string) {
  return `Đã tạo booking ${id} trên Ops.\nKhách: ${draft.guestName}\nMã: ${draft.pmsCode}\nPhòng: ${draft.roomNumber}\n${OPS_BASE}/sales/bookings/${id}`;
}

export function replyAction(text: string) {
  const value = text.trim().toLowerCase();
  if (/^(có|co|check|kiểm tra|kiem tra)$/.test(value)) return "check";
  if (/^(không|khong|không cần|khong can|skip|bỏ qua|bo qua)$/.test(value)) return "skip";
  if (/^(ok|ổn|on|tạo|tao|xác nhận|xac nhan|yes|đồng ý|dong y)$/.test(value)) return "create";
  if (/^(huỷ|huy|hủy|cancel|thôi|thoi)$/.test(value)) return "cancel";
  if (/^\d{2,4}$/.test(value)) return "room";
  return "";
}

export type CatalogType = { type: string; code: string; rooms: string[] };

export type RoomCatalog = {
  ok: boolean;
  error: string;
  types: CatalogType[];
};

export async function roomCatalog(token: string, from: string, to: string): Promise<RoomCatalog> {
  if (!token) return { ok: false, error: "Chưa có token Open API, chưa check được phòng trống.", types: [] };
  const url = new URL(`${OPS_BASE}/api/open/availability`);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    types?: { type?: string; code?: string; rooms?: string[] }[];
  };
  if (!response.ok || !payload.ok) {
    return { ok: false, error: payload.error || `Open API HTTP ${response.status}`, types: [] };
  }
  return {
    ok: true,
    error: "",
    types: (payload.types || []).map((row) => ({
      type: row.type || "",
      code: row.code || "",
      rooms: row.rooms || [],
    })),
  };
}

export function exactCatalogType(wanted: string, types: CatalogType[]) {
  const key = wanted.trim().toUpperCase();
  if (!key) return null;
  return types.find((row) => row.type.toUpperCase() === key || row.code.toUpperCase() === key) || null;
}

export async function suggestCatalogTypes(apiKey: string, wanted: string, types: CatalogType[]) {
  const names = types.map((row) => row.type).filter(Boolean);
  if (!wanted.trim() || !names.length) return [];
  if (!apiKey) return heuristicTypes(wanted, types);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Map hạng phòng OTA sang hạng Ops. Chỉ trả JSON {\"types\":[...]} tối đa 3 tên, gần đúng nhất đứng trước. Mỗi tên phải nằm nguyên trong danh sách Ops, không bịa.",
        },
        {
          role: "user",
          content: `OTA: ${wanted}\nOps: ${names.join(", ")}`,
        },
      ],
    }),
  });
  if (!response.ok) return heuristicTypes(wanted, types);
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  try {
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "") as { types?: unknown };
    const allowed = new Map(names.map((name) => [name.toUpperCase(), name]));
    const picked = (Array.isArray(parsed.types) ? parsed.types : [])
      .map((name) => allowed.get(String(name).trim().toUpperCase()) || "")
      .filter(Boolean);
    return [...new Set(picked)].slice(0, 3);
  } catch {
    return heuristicTypes(wanted, types);
  }
}

export async function createOpsBooking(token: string, draft: BookingDraft) {
  const response = await fetch(`${OPS_BASE}/api/open/bookings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      guestName: draft.guestName,
      guestPhone: draft.guestPhone,
      source: draft.source || "ota",
      origin: "ezcloud",
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      pmsCode: draft.pmsCode,
      notes: draft.notes,
      deposit: 0,
      paymentMethod: "cash",
      rooms: [
        {
          roomNumber: draft.roomNumber,
          rate: draft.rate || undefined,
          adults: draft.adults,
          children: draft.children,
          breakfast: draft.breakfast,
        },
      ],
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    booking?: { id?: string };
  };
  if (!response.ok || !payload.ok || !payload.booking?.id) {
    throw new Error(payload.error || `Ops HTTP ${response.status}`);
  }
  return payload.booking.id;
}

export async function existingOpsBooking(token: string, pmsCode: string) {
  if (!token || !pmsCode) return "";
  const response = await fetch(`${OPS_BASE}/api/open/bookings?pmsCode=${encodeURIComponent(pmsCode)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return "";
  const payload = (await response.json()) as { booking?: { id?: string } };
  return payload.booking?.id || "";
}

function draftText(draft: BookingDraft) {
  return [
    "Draft booking",
    `Khách: ${draft.guestName || "(chưa rõ)"}`,
    draft.guestEmail ? `Email: ${draft.guestEmail}` : "",
    `Mã: ${draft.pmsCode || "(chưa rõ)"}`,
    `Kênh: ${draft.source || "(chưa rõ)"}`,
    draft.statusLabel ? `Trạng thái: ${draft.statusLabel}` : "",
    `Nhận: ${draft.checkIn || "?"} → Trả: ${draft.checkOut || "?"}`,
    `Hạng: ${draft.roomType || "(chưa rõ)"}`,
    draft.roomNumber ? `Phòng: ${draft.roomNumber}` : "",
    `Khách ở: ${draft.adults} người lớn, ${draft.children} trẻ em`,
    draft.rate ? `Tổng: ${formatVnd(draft.rate)}` : "",
    draft.paymentNote ? `Thu: ${draft.paymentNote}` : "",
    draft.breakfast ? "Ăn sáng: có" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function emptyDraft(): BookingDraft {
  return {
    id: "",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    source: "ota",
    checkIn: "",
    checkOut: "",
    roomType: "",
    roomNumber: "",
    adults: 1,
    children: 0,
    rate: 0,
    pmsCode: "",
    notes: "",
    breakfast: false,
    paymentNote: "",
    statusLabel: "",
    roomTypeByNumber: {},
  };
}

function heuristicTypes(wanted: string, types: CatalogType[]) {
  const words = wanted.toUpperCase().split(/[^A-Z0-9]+/).filter((word) => word.length > 2);
  return types
    .map((row) => ({
      type: row.type,
      score: words.filter((word) => row.type.toUpperCase().includes(word) || row.code.toUpperCase().includes(word)).length,
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((row) => row.type);
}

function channel(value: string) {
  const compact = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (compact.includes("agoda")) return "agoda";
  if (compact.includes("booking")) return "booking";
  if (compact.includes("traveloka")) return "traveloka";
  if (compact.includes("expedia")) return "expedia";
  if (compact.includes("airbnb")) return "airbnb";
  if (compact.includes("ezcloud")) return "ezcloud";
  return "ota";
}

function money(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function formatVnd(amount: number) {
  return `${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} VND`;
}

function isoDate(year: number, month: number, day: number) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateOr(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
