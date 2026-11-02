import { NextRequest, NextResponse } from "next/server";

/**
 * Route protection gate for industrial workflows.
 *
 * Security notes:
 * - This is an authentication-presence gate only (verifying indus_token cookie exists).
 * - Backend verification through GET /me remains required before any role-specific content is rendered.
 * - Role and factory authorization is never trusted from this cookie.
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get("indus_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/worker/:path*",
    "/reviewer/:path*",
    "/admin/:path*",
  ],
};
