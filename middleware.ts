import { NextRequest, NextResponse } from "next/server";

/**
 * Bearer-token auth for /api/* routes.
 *
 * Fail-open: if G2M_API_SECRET is unset or empty, requests pass through
 * without an auth check. This lets the middleware ship before the env var
 * is configured in Vercel; enforcement turns on the moment the secret is
 * present.
 *
 * Same-origin browser requests (sec-fetch-site: same-origin) are always
 * allowed — these come from the UI itself, not external callers.
 *
 * Public webhook routes are skipped (they have their own provider secrets).
 *
 * Runs on the Next.js Edge runtime, so the comparison is implemented in
 * pure JS (no `node:crypto`). Lengths are checked first; equal-length
 * strings are compared with a constant-time XOR scan.
 */

// Paths under /api/* that must remain publicly reachable (third-party callers).
const PUBLIC_API_PATHS = [
  "/api/webhooks/calendly",
  "/api/webhooks/manus",
  "/api/webhooks/zoom",
  "/api/webhook/analysis",
  "/api/webhook/refresh",
  "/api/webhook/skill-update",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Same-origin browser fetches (from the UI itself) are always allowed.
  // Browsers set this header automatically; external callers do not.
  if (request.headers.get("sec-fetch-site") === "same-origin") {
    return NextResponse.next();
  }

  const secret = process.env.G2M_API_SECRET;
  if (!secret) {
    // Fail-open: secret not configured yet, let traffic through.
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1]?.trim() ?? "";

  if (!provided || !tokensMatch(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
