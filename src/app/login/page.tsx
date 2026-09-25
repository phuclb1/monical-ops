import Link from "next/link";
import { Btn } from "@/components/ui";
import { Logo } from "@/components/logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  return (
    <main className="min-h-dvh min-h-[100dvh] bg-burgundy md:grid md:grid-cols-[1.1fr_min(440px,42vw)]">
      <section className="flex flex-col justify-center px-5 pb-4 pt-[max(2rem,calc(env(safe-area-inset-top)+0.75rem))] md:px-16 md:pt-8">
        <div className="mx-auto w-[220px] md:mx-0 md:w-[280px]">
          <Logo priority className="w-full" />
        </div>
        <p className="-mt-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-cream/80 md:text-left">
          Vận hành
        </p>
        <p className="mt-3 text-center text-sm leading-6 text-cream/75 md:max-w-md md:text-left">
          Điều phối ca, checklist, bàn giao và biểu mẫu. Booking / tiền phòng vẫn nằm trên ezCloudhotel PMS.
        </p>
        <p className="mt-6 hidden text-sm text-cream/60 md:block">Mở trên điện thoại để dùng PWA, hoặc làm việc trên laptop tại đây.</p>
      </section>

      <section className="px-5 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.25rem))] md:flex md:flex-col md:justify-center md:bg-sand md:px-10 md:pb-10">
        <form action="/api/auth/login" method="post" className="card mt-6 space-y-3 p-4 md:mt-0">
          <h1 className="hidden text-xl font-bold md:block">Đăng nhập</h1>
          <label>
            Tài khoản
            <input name="username" autoComplete="username" required placeholder="Tài khoản" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="text-sm font-medium text-[#c23b3b]">Sai tài khoản hoặc mật khẩu.</p> : null}
          {reset ? <p className="text-sm font-medium text-[#1b7a4e]">Đã đặt lại mật khẩu. Bạn có thể đăng nhập.</p> : null}
          <Btn type="submit" className="w-full">
            Đăng nhập
          </Btn>
          <Link
            href="/kiem-tra-phong"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-burgundy"
          >
            Kiểm tra phòng nhanh
          </Link>
          <Link href="/forgot-password" className="block text-center text-sm font-semibold text-burgundy">
            Quên mật khẩu?
          </Link>
        </form>
        <p className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs leading-5 text-cream/70 md:justify-start md:text-left md:text-[#6b5a52]">
          <Link href="/tin-tuc" className="font-semibold text-cream underline decoration-cream/40 md:text-burgundy">
            Tin tức khách sạn
          </Link>
        </p>
      </section>
    </main>
  );
}
