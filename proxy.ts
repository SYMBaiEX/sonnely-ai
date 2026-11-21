import { NextRequest, NextResponse } from "next/server";
import { apiOrigin } from "@/lib/api-contract";
import { retiredApi } from "@/lib/legacy-api";

const currentPages = new Set([
  "/",
  "/models",
  "/pricing",
  "/docs",
  "/blog",
  "/contact",
  "/privacy",
  "/terms",
  "/status",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    /^\/(?:api|v1|cli)(?:\/|$)/.test(pathname) ||
    pathname === "/install.sh"
  ) {
    return retiredApi(request);
  }
  if (pathname.startsWith("/docs/")) {
    return NextResponse.redirect(new URL(pathname, "https://docs.sonnely.com"), 308);
  }
  if (pathname.startsWith("/console/") || pathname === "/console") {
    return NextResponse.redirect(new URL("/console", apiOrigin), 308);
  }
  return NextResponse.redirect(new URL(currentPages.has(pathname) ? pathname : "/", apiOrigin), 308);
}

export const config = {
  matcher: [{ source: "/:path*", has: [{ type: "host", value: "app\\.sonnely\\.com" }] }],
};
