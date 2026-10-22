import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection (Next.js 16 renamed `middleware` to `proxy`).
 *
 * Only the client portal is protected: /sessions and /book (and anything below
 * them). Every other page is public marketing content and passes straight
 * through, with no auth round-trip. /login additionally bounces signed-in users
 * to /sessions. This is an optimistic gate and also refreshes the Supabase
 * session cookies; data access is still enforced by row level security.
 *
 * IMPORTANT: when adding a new portal route, add it to PROTECTED_PREFIXES, or
 * it will be public.
 */
const PROTECTED_PREFIXES = ["/sessions", "/book"];

/**
 * Normalise a pathname the way the router will before matching, so an encoded
 * or oddly-cased spelling (e.g. /%73essions, //book) cannot slip past the check.
 */
function normalisePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Malformed escape: keep the raw path (still checked below).
  }
  return path.toLowerCase().replace(/\/{2,}/g, "/");
}

function isProtectedPath(pathname: string): boolean {
  return [pathname, normalisePath(pathname)].some((path) =>
    PROTECTED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    ),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isProtected = isProtectedPath(pathname);

  // Public marketing page: no Supabase call.
  if (!isLogin && !isProtected) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the token with Supabase Auth (getSession() would trust the cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected) {
    return redirectTo(request, "/login", response);
  }
  if (user && isLogin) {
    return redirectTo(request, "/sessions", response);
  }
  return response;
}

function redirectTo(request: NextRequest, path: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  // Keep any refreshed auth cookies on the redirect response.
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export const config = {
  // Skip only Next internals and the favicon. No file-extension exclusion on
  // purpose: it is safer for the gate to over-protect than to be bypassable.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$).*)"],
};
