import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resetStaffPasswordAction, toggleStaffAction, updateStaffAction } from "@/actions/staff";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { DEPT_LABEL, ROLE_DEPT, ROLE_LABEL } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from "@/lib/password";
import { getStaff } from "@/lib/repos";
import { ROLES, type DepartmentCode } from "@/lib/types";

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageStaff")) redirect("/more");
  const { id } = await params;
  const { error, ok } = await searchParams;
  const person = await getStaff(id);
  if (!person) notFound();
  const self = person.id === user.id;

  return (
    <main className="space-y-3 px-3 py-4">
      <Link href="/staff" className="text-sm font-semibold text-burgundy">
        ← Danh sách
      </Link>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{person.fullName}</h1>
          <p className="text-sm text-[#5c6665]">{person.username}</p>
        </div>
        <Chip tone={person.active ? "ok" : "danger"}>{person.active ? "Hoạt động" : "Đã khóa"}</Chip>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}
      {ok === "1" ? <p className="text-sm text-[#1b7a4e]">Đã lưu hồ sơ.</p> : null}
      {ok === "pw" ? <p className="text-sm text-[#1b7a4e]">Đã đặt lại mật khẩu.</p> : null}

      <Card>
        <form action={updateStaffAction} className="space-y-2">
          <input type="hidden" name="id" value={person.id} />
          <Field label="Họ tên">
            <input name="fullName" required defaultValue={person.fullName} />
          </Field>
          <Field label="Email khôi phục mật khẩu">
            <input name="email" type="email" required autoComplete="email" defaultValue={person.email || ""} />
          </Field>
          <Field label="Vai trò / bộ phận">
            <select name="role" defaultValue={person.role}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]} — {DEPT_LABEL[ROLE_DEPT[role]]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số điện thoại">
            <input name="phone" type="tel" defaultValue={person.phone || ""} />
          </Field>
          <p className="text-xs text-[#6b7372]">
            Bộ phận hiện tại: {DEPT_LABEL[person.departmentCode as DepartmentCode]}
          </p>
          <Btn type="submit" className="w-full">
            Lưu hồ sơ
          </Btn>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Đặt lại mật khẩu</h2>
        <form action={resetStaffPasswordAction} className="space-y-2">
          <input type="hidden" name="id" value={person.id} />
          <Field label="Mật khẩu mới">
            <input
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-describedby="reset-password-help"
            />
            <span id="reset-password-help" className="mt-1 block text-xs text-[#6b7372]">{PASSWORD_REQUIREMENTS}.</span>
          </Field>
          <Btn type="submit" variant="ghost" className="w-full">
            Đặt lại mật khẩu
          </Btn>
        </form>
      </Card>

      <form action={toggleStaffAction}>
        <input type="hidden" name="id" value={person.id} />
        <input type="hidden" name="active" value={person.active ? "0" : "1"} />
        <Btn type="submit" variant={person.active ? "danger" : "primary"} className="w-full" disabled={self}>
          {self ? "Không khóa tài khoản đang dùng" : person.active ? "Khóa tài khoản" : "Mở khóa"}
        </Btn>
      </form>
    </main>
  );
}
