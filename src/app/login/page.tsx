import Link from "next/link";
import { NativePostForm, PendingSubmit } from "@/components/pending-submit";
import { Logo } from "@/components/logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  return (
    <main className="min-h-dvh min-h-[100dvh] bg-burgundy md:grid md:grid-cols-[1.1fr_min(440px,42vw)]">
      <section className="flex items-center justify-center px-5 py-8 pt-[max(2rem,calc(env(safe-area-inset-top)+0.75rem))] md:px-16 md:py-10">
        <div className="w-[220px] md:w-[280px]">
          <Logo priority className="w-full" />
        </div>
      </section>

      <section className="px-5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.25rem))] md:flex md:flex-col md:justify-center md:bg-sand md:px-10 md:pb-10">
        <NativePostForm action="/api/auth/login" className="card mt-6 space-y-3 p-4 md:mt-0">
          <h1 className="hidden text-xl font-bold md:block">Đăng nhập</h1>
          <label>
            Tài khoản
            <input name="username" autoComplete="username" required placeholder="Tài khoản" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error === "ip" ? (
            <p className="text-sm font-medium text-[#c23b3b]">Tài khoản lễ tân chỉ đăng nhập được từ máy quầy.</p>
          ) : error === "paused" ? (
            <p className="text-sm font-medium text-[#c23b3b]">Module vận hành tạm dừng.</p>
          ) : error === "rate" ? (
            <p className="text-sm font-medium text-[#c23b3b]">Đăng nhập quá nhanh. Hãy đợi một lát rồi thử lại.</p>
          ) : error ? (
            <p className="text-sm font-medium text-[#c23b3b]">Sai tài khoản hoặc mật khẩu.</p>
          ) : null}
          {reset ? <p className="text-sm font-medium text-[#1b7a4e]">Đã đặt lại mật khẩu. Bạn có thể đăng nhập.</p> : null}
          <PendingSubmit className="w-full" pendingLabel="Đang đăng nhập...">
            Đăng nhập
          </PendingSubmit>
          <Link href="/forgot-password" className="block text-center text-sm font-semibold text-burgundy">
            Quên mật khẩu?
          </Link>
        </NativePostForm>
        <p className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs leading-5 text-cream/70 md:justify-start md:text-left md:text-[#6b5a52]">
          <Link href="/tin-tuc" className="font-semibold text-cream underline decoration-cream/40 md:text-burgundy">
            Tin tức khách sạn
          </Link>
        </p>
      </section>
    </main>
  );
}
