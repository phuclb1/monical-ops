import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { homePath, isAccountingAllowedPath, isAccountingPath, isOwnerPath } from "@/lib/nav";
import { readSessionToken } from "@/lib/session-token";

const PUBLIC = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/kiem-tra-phong",
  "/tin-tuc",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/ingest",
];

function withCache(res: NextResponse, value: string) {
  res.headers.set("Cache-Control", value);
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" ||
    pathname === "/logo.png" ||
    pathname === "/apple-touch-icon.png"
  ) {
    return NextResponse.next();
  }

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const res = NextResponse.next();
    if (pathname === "/sw.js") return withCache(res, "public, max-age=0, must-revalidate");
    if (pathname === "/kiem-tra-phong") return withCache(res, "public, max-age=0, must-revalidate");
    if (pathname.startsWith("/tin-tuc") || pathname === "/sitemap.xml" || pathname === "/robots.txt") {
      return withCache(res, "public, s-maxage=3600, stale-while-revalidate=86400");
    }
    if (pathname === "/login" || pathname.startsWith("/api/")) {
      return withCache(res, "private, no-store");
    }
    return res;
  }

  const token = request.cookies.get("ops_session")?.value;
  const session = token ? await readSessionToken(token) : null;
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withCache(NextResponse.redirect(url), "private, no-store");
  }
  if (session.role === "owner" && !isOwnerPath(pathname) && !pathname.startsWith("/account/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/owner";
    url.search = "";
    return withCache(NextResponse.redirect(url), "private, no-store");
  }
  if (session.role === "accounting" && !isAccountingAllowedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/accounting";
    url.search = "";
    return withCache(NextResponse.redirect(url), "private, no-store");
  }
  if (session.role !== "owner" && isOwnerPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = homePath(session.role);
    url.search = "";
    return withCache(NextResponse.redirect(url), "private, no-store");
  }
  if (session.role !== "accounting" && isAccountingPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = homePath(session.role);
    url.search = "";
    return withCache(NextResponse.redirect(url), "private, no-store");
  }
  return withCache(NextResponse.next(), "private, no-store");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
