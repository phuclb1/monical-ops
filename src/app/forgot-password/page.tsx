import Link from "next/link";
import { NativePostForm, PendingSubmit } from "@/components/pending-submit";
import { Card, Field } from "@/components/ui";
import { Logo } from "@/components/logo";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
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
            <NativePostForm action="/api/auth/forgot-password" className="mt-3 space-y-3">
              <p className="text-sm leading-6 text-[#5c6665]">Nhập email đã đăng ký với tài khoản.</p>
              {error === "rate" ? <p className="text-sm font-medium text-[#c23b3b]">Gửi quá nhanh. Hãy đợi một lát rồi thử lại.</p> : null}
              <Field label="Email">
                <input name="email" type="email" required autoComplete="email" />
              </Field>
              <PendingSubmit className="w-full" pendingLabel="Đang gửi...">Gửi liên kết khôi phục</PendingSubmit>
            </NativePostForm>
          )}
        </Card>
        <Link href="/login" className="block text-center text-sm font-semibold text-burgundy">← Quay lại đăng nhập</Link>
      </div>
    </main>
  );
}
