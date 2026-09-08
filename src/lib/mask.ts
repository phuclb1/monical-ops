import type { Role } from "./types";

export function maskName(name: string, role: Role) {
  if (role !== "accounting") return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 1)}***`;
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}***`;
}

export function maskPhone(phone?: string | null, role?: Role) {
  if (!phone) return "—";
  if (role === "accounting") return phone.replace(/\d(?=\d{3})/g, "•");
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 3)}•••${phone.slice(-3)}`;
}

export function maskIdNumber() {
  return "••••••••";
}
