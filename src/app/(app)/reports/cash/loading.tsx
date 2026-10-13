export default function CashReportLoading() {
  return (
    <main className="booking-desk space-y-3 px-3 py-4" aria-busy="true" aria-label="Đang tải dòng tiền">
      <div className="h-7 w-52 animate-pulse rounded-lg bg-[#ead9c4]" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="card h-16 animate-pulse bg-[#fff8ee]" />
        <div className="card h-16 animate-pulse bg-[#fff8ee]" />
        <div className="card h-16 animate-pulse bg-[#fff8ee]" />
      </div>
      <div className="card h-64 animate-pulse bg-[#fff8ee]" />
    </main>
  );
}
