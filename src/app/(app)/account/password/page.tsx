import Link from "next/link";
import { redirect } from "next/navigation";
import { changePasswordAction } from "@/actions/auth";
import { Btn, Card, Field } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from "@/lib/password";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { error, ok } = await searchParams;
  const backHref = user.role === "owner" ? "/owner" : user.role === "accounting" ? "/accounting" : "/more";

  return (
    <main className="space-y-3 px-3 py-4">
      <Link href={backHref} className="text-sm font-semibold text-burgundy">← Quay lại</Link>
      <h1 className="text-xl font-bold">Đổi mật khẩu</h1>
      {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
      {ok ? <p className="text-sm font-medium text-[#1b7a4e]">Đã đổi mật khẩu và đăng xuất các phiên khác.</p> : null}
      <Card>
        <form action={changePasswordAction} className="space-y-3">
          <Field label="Mật khẩu hiện tại">
            <input name="currentPassword" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="Mật khẩu mới">
            <input
              name="newPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-describedby="password-help"
            />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <input
              name="confirmation"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
            />
          </Field>
          <p id="password-help" className="text-xs leading-5 text-[#6b7372]">{PASSWORD_REQUIREMENTS}.</p>
          <Btn type="submit" className="w-full">Đổi mật khẩu</Btn>
        </form>
      </Card>
    </main>
  );
}
