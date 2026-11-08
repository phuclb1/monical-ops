import { isRoomFocus } from "./room-focus";
import { isSaleOrigin } from "./sales/status";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function chartReturnHref(value: string | null | undefined) {
  if (!value || value.includes("#") || value.includes("\\")) return null;
  const split = value.indexOf("?");
  const path = split === -1 ? value : value.slice(0, split);
  if (path !== "/sales") return null;
  const params = new URLSearchParams(split === -1 ? "" : value.slice(split + 1));
  const next = new URLSearchParams();
  const date = params.get("date") || "";
  if (date) {
    if (!DATE.test(date)) return null;
    next.set("date", date);
  }
  const origin = params.get("origin") || "";
  if (origin) {
    if (!isSaleOrigin(origin)) return null;
    next.set("origin", origin);
  }
  const focus = params.get("focus") || "";
  if (focus) {
    if (!isRoomFocus(focus)) return null;
    next.set("focus", focus);
  }
  const view = params.get("view") || "";
  if (view) {
    if (view !== "15" && view !== "month") return null;
    next.set("view", view);
  }
  const group = params.get("group") || "";
  if (group) {
    if (group !== "type") return null;
    next.set("group", group);
  }
  const text = next.toString();
  return text ? `/sales?${text}` : "/sales";
}

export function withChartReturn(href: string, chart: string) {
  const back = chartReturnHref(chart);
  if (!back) return href;
  const split = href.indexOf("?");
  const path = split === -1 ? href : href.slice(0, split);
  if (!path.startsWith("/") || path.startsWith("//")) return href;
  const params = new URLSearchParams(split === -1 ? "" : href.slice(split + 1));
  params.set("from", back);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}
