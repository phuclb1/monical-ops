import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { nid, nowISO } from "../datetime";
import { hashPassword } from "../password";
import { ROLE_DEPT } from "../constants";
import type { Role, SessionUser } from "../types";
import { audit } from "./audit";
import { listUsers } from "./users";

export async function listDepartments() {
  const db = await getDb();
  return db.select().from(t.departments);
}

export async function getStaff(id: string) {
  const people = await listUsers();
  return people.find((u) => u.id === id) ?? null;
}

export async function createStaff(
  actor: SessionUser,
  data: { username: string; password: string; fullName: string; role: Role; phone?: string },
) {
  const db = await getDb();
  const username = data.username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Tài khoản 3–32 ký tự, chỉ chữ thường, số, . _ -");
  if (data.password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
  if (!data.fullName.trim()) throw new Error("Nhập họ tên");
  const exists = (await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.username, username)).limit(1))[0];
  if (exists) throw new Error("Tài khoản đã tồn tại");
  const deptCode = ROLE_DEPT[data.role];
  const dept = (await db.select().from(t.departments).where(eq(t.departments.code, deptCode)).limit(1))[0];
  if (!dept) throw new Error("Không tìm thấy bộ phận");
  const id = nid();
  const now = nowISO();
  await db.insert(t.users).values({
    id,
    username,
    passwordHash: await hashPassword(data.password),
    fullName: data.fullName.trim(),
    role: data.role,
    departmentId: dept.id,
    phone: data.phone?.trim() || null,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  await audit(actor.id, "user", id, "create", null, { username, role: data.role, fullName: data.fullName });
  return id;
}

export async function updateStaff(
  actor: SessionUser,
  id: string,
  data: { fullName: string; role: Role; phone?: string },
) {
  const db = await getDb();
  const before = (await db.select().from(t.users).where(eq(t.users.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy nhân viên");
  const deptCode = ROLE_DEPT[data.role];
  const dept = (await db.select().from(t.departments).where(eq(t.departments.code, deptCode)).limit(1))[0];
  if (!dept) throw new Error("Không tìm thấy bộ phận");
  await db
    .update(t.users)
    .set({
      fullName: data.fullName.trim(),
      role: data.role,
      departmentId: dept.id,
      phone: data.phone?.trim() || null,
      updatedAt: nowISO(),
    })
    .where(eq(t.users.id, id));
  await audit(actor.id, "user", id, "update", before, data);
}

export async function setStaffActive(actor: SessionUser, id: string, active: boolean) {
  if (id === actor.id) throw new Error("Không khóa tài khoản đang đăng nhập");
  const db = await getDb();
  const before = (await db.select().from(t.users).where(eq(t.users.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy nhân viên");
  if (!active && before.role === "manager") {
    const others = await db.select().from(t.users);
    const remaining = others.filter((u) => u.role === "manager" && u.active && u.id !== id);
    if (remaining.length === 0) throw new Error("Phải còn ít nhất một quản lý đang hoạt động");
  }
  await db.update(t.users).set({ active, updatedAt: nowISO() }).where(eq(t.users.id, id));
  await audit(actor.id, "user", id, active ? "unlock" : "lock", { active: before.active }, { active });
}

export async function resetStaffPassword(actor: SessionUser, id: string, password: string) {
  if (password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
  const db = await getDb();
  const before = (await db.select().from(t.users).where(eq(t.users.id, id)).limit(1))[0];
  if (!before) throw new Error("Không tìm thấy nhân viên");
  await db
    .update(t.users)
    .set({ passwordHash: await hashPassword(password), updatedAt: nowISO() })
    .where(eq(t.users.id, id));
  await audit(actor.id, "user", id, "reset_password", { username: before.username }, { reset: true });
}
