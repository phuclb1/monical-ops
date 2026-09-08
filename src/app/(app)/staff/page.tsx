import Link from "next/link";
import { redirect } from "next/navigation";
import { createStaffAction } from "@/actions/staff";
import { Btn, Card, Chip, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { DEPT_LABEL, ROLE_LABEL } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { listUsers } from "@/lib/repos";
import { ROLES, type DepartmentCode, type Role } from "@/lib/types";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!can(user.role, "manageStaff")) redirect("/more");
  const { error } = await searchParams;
  const people = await listUsers();

  return (
    <main className="space-y-3 px-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Nhân viên</h1>
          <p className="text-xs text-[#5c6665]">Chỉ quản lý tạo, sửa, khóa và đặt lại mật khẩu. Không xóa vĩnh viễn.</p>
        </div>
        <Link href="/roster" className="text-sm font-semibold text-teal">
          Lịch lễ tân
        </Link>
      </div>
      {error ? <p className="text-sm text-[#c23b3b]">{error}</p> : null}

      <div className="md:grid md:grid-cols-[360px_minmax(0,1fr)] md:items-start md:gap-4">
      <Card>
        <h2 className="mb-2 font-bold">Thêm tài khoản</h2>
        <form action={createStaffAction} className="space-y-2">
          <Field label="Họ tên">
            <input name="fullName" required placeholder="Nguyễn Văn A" />
          </Field>
          <Field label="Tài khoản đăng nhập">
            <input name="username" required autoCapitalize="none" placeholder="nguyenvana" />
          </Field>
          <Field label="Mật khẩu tạm">
            <input name="password" type="password" required minLength={6} placeholder="Tối thiểu 6 ký tự" />
          </Field>
          <Field label="Vai trò / bộ phận">
            <select name="role" defaultValue="reception">
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Số điện thoại">
            <input name="phone" type="tel" placeholder="090..." />
          </Field>
          <Btn type="submit" className="w-full">
            Tạo nhân viên
          </Btn>
        </form>
      </Card>

      <div className="mt-3 list-cards md:mt-0">
      {people.map((person) => (
        <Link key={person.id} href={`/staff/${person.id}`}>
          <Card className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-bold">{person.fullName}</p>
              <p className="text-xs text-[#5c6665]">
                {person.username} · {ROLE_LABEL[person.role as Role]} ·{" "}
                {DEPT_LABEL[person.departmentCode as DepartmentCode]}
              </p>
            </div>
            <Chip tone={person.active ? "ok" : "danger"}>{person.active ? "Hoạt động" : "Đã khóa"}</Chip>
          </Card>
        </Link>
      ))}
      </div>
      </div>
    </main>
  );
}
