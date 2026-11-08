const OPS_URL = "https://platform.monicalhoteldalat.com/sales/new";

export type InboundMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
};

export function plainText(text: string | undefined, html: string | undefined) {
  if (text?.trim()) return text.trim();
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function linesOf(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function after(lines: string[], index: number) {
  return index >= 0 ? lines[index + 1] || "" : "";
}

export function forwardMessage(mail: InboundMail) {
  const lines = linesOf(mail.text);
  const code = mail.text.match(/Mã đặt phòng:\s*(\S+)/)?.[1];
  if (!code) {
    const excerpt = mail.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 1500);
    return [
      "Email chuyển tiếp",
      `Từ: ${mail.from}`,
      `Tiêu đề: ${mail.subject || "(không có tiêu đề)"}`,
      "---",
      excerpt || "(không có nội dung)",
      `Nhập Ops: ${OPS_URL}`,
    ]
      .join("\n")
      .slice(0, 4000);
  }

  const codeIndex = lines.findIndex((line) => line.includes(code));
  const partyIndex = lines.findIndex((line) => /khách/.test(line) && /phòng/.test(line));
  const stay = lines.find((line) => /tháng/.test(line) && line.includes(" - ")) || "";
  const guestEmail = lines.find((line) => line.includes("@") && !line.includes("maccaldalathotel@gmail.com")) || "";
  const emailIndex = guestEmail ? lines.indexOf(guestEmail) : -1;
  const total = mail.text.match(/Tổng tiền:\s*([^\n]+)/)?.[1]?.trim() || "";
  const commission = mail.text.match(/Hoa hồng:\s*([^\n]+)/)?.[1]?.trim() || "";
  const benefits = mail.text.match(/Benefits:\s*([^\n]+)/)?.[1]?.trim() || "";
  const requests = mail.text.match(/Requests:\s*([^\n]+)/)?.[1]?.trim() || "";
  const room = lines.find((line) => /STANDARD|DELUXE|SUPERIOR|SUITE|VILLA/i.test(line)) || "";
  const fields = [
    "Booking chuyển tiếp",
    `Tiêu đề: ${mail.subject || "(không có tiêu đề)"}`,
    `Mã: ${code}`,
    `Trạng thái: ${after(lines, codeIndex)}`,
    stay ? `Ở: ${stay}` : "",
    partyIndex >= 0 ? lines[partyIndex] : "",
    partyIndex >= 0 ? `Khách: ${after(lines, partyIndex)}` : "",
    guestEmail ? `Email: ${guestEmail}` : "",
    emailIndex >= 0 ? `Kênh: ${after(lines, emailIndex)}` : "",
    emailIndex >= 0 ? `Thu: ${after(lines, emailIndex + 1)}` : "",
    room ? `Phòng: ${room}` : "",
    total ? `Tổng: ${total}` : "",
    commission ? `Hoa hồng: ${commission}` : "",
    benefits ? `Quyền lợi: ${benefits}` : "",
    requests ? `Yêu cầu: ${requests}` : "",
    `Nhập Ops: ${OPS_URL}`,
  ];
  return fields.filter(Boolean).join("\n").slice(0, 4000);
}

export function isStartCommand(text: string) {
  return /^\/start(?:@\w+)?(?:\s+\S+)?$/i.test(text.trim());
}

export function isStopCommand(text: string) {
  return /^\/stop(?:@\w+)?$/i.test(text.trim());
}

export function sameSecret(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export type TelegramButton = { text: string; data: string };

export async function sendTelegram(token: string, chatId: string, text: string, buttons: TelegramButton[][] = []) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: buttons.length
        ? { inline_keyboard: buttons.map((row) => row.map((button) => ({ text: button.text, callback_data: button.data }))) }
        : undefined,
    }),
  });
  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram HTTP ${response.status}`);
  }
}

export async function answerCallback(token: string, callbackId: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}
