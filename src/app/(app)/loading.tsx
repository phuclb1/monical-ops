export default function AppLoading() {
  return (
    <main className="space-y-3 px-3 py-4" aria-busy="true" aria-label="Đang tải">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-[#ead9c4]" />
      <div className="card h-28 animate-pulse bg-[#fff8ee]" />
      <div className="card h-24 animate-pulse bg-[#fff8ee]" />
      <div className="card h-24 animate-pulse bg-[#fff8ee]" />
    </main>
  );
}
