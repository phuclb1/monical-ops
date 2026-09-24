import Link from "next/link";
import { Btn, Card, Field } from "@/components/ui";
import { Logo } from "@/components/logo";
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from "@/lib/password";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;
  const hasToken = /^[A-Za-z0-9_-]{40,50}$/.test(token);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-sand px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="mx-auto w-44 rounded-xl bg-burgundy p-3">
          <Logo priority className="w-full" />
        </div>
        <Card>
          <h1 className="text-xl font-bold">Đặt lại mật khẩu</h1>
          {!hasToken ? (
            <p className="mt-3 text-sm text-[#c23b3b]">Liên kết không hợp lệ hoặc đã hết hạn.</p>
          ) : (
            <form action="/api/auth/reset-password" method="post" className="mt-3 space-y-3">
              <input type="hidden" name="token" value={token} />
              {error ? <p className="text-sm font-medium text-[#c23b3b]">{error}</p> : null}
              <Field label="Mật khẩu mới">
                <input
                  name="password"
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
              <Btn type="submit" className="w-full">Đặt lại mật khẩu</Btn>
            </form>
          )}
        </Card>
        <Link href="/login" className="block text-center text-sm font-semibold text-burgundy">← Quay lại đăng nhập</Link>
      </div>
    </main>
  );
}
