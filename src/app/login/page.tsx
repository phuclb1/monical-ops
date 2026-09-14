import Link from "next/link";
import { Btn } from "@/components/ui";
import { Logo } from "@/components/logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
            <input name="username" autoComplete="username" required placeholder="ngan" />
          </label>
          <label>
            Mật khẩu
            <input name="password" type="password" autoComplete="current-password" required defaultValue="123456" />
          </label>
          {error ? <p className="text-sm font-medium text-[#c23b3b]">Sai tài khoản hoặc mật khẩu.</p> : null}
          <Btn type="submit" className="w-full">
            Đăng nhập
          </Btn>
        </form>
        <div className="mt-5 text-center text-xs leading-5 text-cream/70 md:text-left md:text-[#6b5a52]">
          <p className="font-semibold text-cream md:text-ink">Tài khoản demo / mật khẩu 123456</p>
          <p>ngan · thu · tuyen · uyen · thuy · oanh · quanly</p>
          <p className="mt-3">
            <Link href="/tin-tuc" className="font-semibold text-cream underline decoration-cream/40 md:text-burgundy">
              Tin tức · Top 5 khách sạn Đà Lạt gần trung tâm
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
