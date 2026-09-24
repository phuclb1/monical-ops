import Link from "next/link";
import { Btn, Card, Field } from "@/components/ui";
import { Logo } from "@/components/logo";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sand px-4 py-8">
      <div className="w-full max-w-md space-y-4">
        <div className="mx-auto w-44 rounded-xl bg-burgundy p-3">
          <Logo priority className="w-full" />
        </div>
        <Card>
          <h1 className="text-xl font-bold">Tìm lại mật khẩu</h1>
          {sent ? (
            <p className="mt-3 text-sm leading-6 text-[#1b7a4e]">
              Nếu email đã được đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu. Liên kết hết hạn sau 30 phút.
            </p>
          ) : (
            <form action="/api/auth/forgot-password" method="post" className="mt-3 space-y-3">
              <p className="text-sm leading-6 text-[#5c6665]">Nhập email đã đăng ký với tài khoản.</p>
              <Field label="Email">
                <input name="email" type="email" required autoComplete="email" />
              </Field>
              <Btn type="submit" className="w-full">Gửi liên kết khôi phục</Btn>
            </form>
          )}
        </Card>
        <Link href="/login" className="block text-center text-sm font-semibold text-burgundy">← Quay lại đăng nhập</Link>
      </div>
    </main>
  );
}
