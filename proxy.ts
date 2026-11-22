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
  "/inference",
  "/observability",
  "/compute",
  "/blackboxes",
  "/dry-docks",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (request.headers.get("host") === "docs.sonnely.com") {
    if (
      pathname === "/docs" ||
      pathname.startsWith("/docs/") ||
      pathname.startsWith("/llms.mdx/docs/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/brand/") ||
      pathname.startsWith("/sdk/") ||
      /^\/(?:api\/(?:search|openapi)|llms(?:-full)?\.txt|robots\.txt|sitemap\.xml|favicon\.ico|apple-icon\.png)$/.test(
        pathname,
      )
    )
      return NextResponse.next();

    if (pathname === "/") {
      const docs = request.nextUrl.clone();
      docs.pathname = "/docs";
      return NextResponse.redirect(docs, 307);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const site = new URL(apiOrigin);
    site.pathname = pathname;
    site.search = request.nextUrl.search;
    return NextResponse.redirect(site, 308);
  }
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
  matcher: [
    { source: "/:path*", has: [{ type: "host", value: "app\\.sonnely\\.com" }] },
    { source: "/:path*", has: [{ type: "host", value: "docs\\.sonnely\\.com" }] },
  ],
};
