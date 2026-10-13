export default function BookingsLoading() {
  return (
    <main className="booking-desk space-y-3 px-3 py-4" aria-busy="true" aria-label="Đang tải đặt phòng">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-[#ead9c4]" />
      <div className="card h-24 animate-pulse bg-[#fff8ee]" />
      <div className="flex gap-2">
        <div className="h-9 w-28 animate-pulse rounded-full bg-[#ead9c4]" />
        <div className="h-9 w-36 animate-pulse rounded-full bg-[#ead9c4]" />
        <div className="h-9 w-36 animate-pulse rounded-full bg-[#ead9c4]" />
      </div>
      <div className="card h-20 animate-pulse bg-[#fff8ee]" />
      <div className="card h-20 animate-pulse bg-[#fff8ee]" />
      <div className="card h-20 animate-pulse bg-[#fff8ee]" />
    </main>
  );
}
