import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow: static assets, Next internals, auth API, sms API
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/sms") ||
    pathname.startsWith("/api/posts") ||
    pathname.startsWith("/api/replies") ||
    pathname.startsWith("/api/creative") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/school-logo") ||
    PUBLIC_PATHS.some((p) => pathname === p)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("ai_ethics_token")?.value;
  if (!token) {
    // For API routes, return 401 JSON instead of redirecting
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
