import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  homePath,
  isAccountingAllowedPath,
  isAccountingPath,
  isKitchenAllowedPath,
  isOwnerPath,
  isPausedOpsRole,
  isRemovedOpsPath,
} from "@/lib/nav";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session-token";

const PUBLIC = [
  "/login",
  "/forgot-password",
  "/reset-password",
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
  "/api/open",
  "/api/zalo/cron",
  "/api/zalo/agent",
  "/api/webhooks/sepay",
];

function withCache(res: NextResponse, value: string) {
  res.headers.set("Cache-Control", value);
  return res;
}

function redirectTo(request: NextRequest, pathname: string, search = "") {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  return withCache(NextResponse.redirect(url), "private, no-store");
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
    if (pathname.startsWith("/tin-tuc") || pathname === "/sitemap.xml" || pathname === "/robots.txt") {
      return withCache(res, "public, s-maxage=3600, stale-while-revalidate=86400");
    }
    if (pathname === "/login" || pathname.startsWith("/api/")) {
      return withCache(res, "private, no-store");
    }
    return res;
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSessionToken(token) : null;
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withCache(NextResponse.redirect(url), "private, no-store");
  }
  if (isPausedOpsRole(session.role)) {
    return redirectTo(request, "/login", "?error=paused");
  }
  if (isRemovedOpsPath(pathname)) {
    return redirectTo(request, homePath(session.role));
  }
  if (session.role === "owner" && !isOwnerPath(pathname) && !pathname.startsWith("/account/")) {
    return redirectTo(request, "/owner");
  }
  if (session.role === "accounting" && !isAccountingAllowedPath(pathname)) {
    return redirectTo(request, "/accounting");
  }
  if (session.role === "kitchen" && !isKitchenAllowedPath(pathname)) {
    return redirectTo(request, "/kitchen");
  }
  if (session.role !== "owner" && isOwnerPath(pathname)) {
    return redirectTo(request, homePath(session.role));
  }
  if (session.role !== "accounting" && isAccountingPath(pathname)) {
    return redirectTo(request, homePath(session.role));
  }
  return withCache(NextResponse.next(), "private, no-store");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
