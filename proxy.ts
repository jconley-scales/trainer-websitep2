import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Admin-area gate (Next.js 16 renamed `middleware` to `proxy`).
 *
 * Runs only for /admin. It refreshes the Supabase session cookies and sends a
 * signed-out visitor to the sign-in page (and a signed-in one away from it).
 * This is an optimistic gate: whether the account may see bookings at all is
 * decided by the database (row level security + the admins list).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isSignIn = pathname === "/admin/sign-in";

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
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

  if (!user && !isSignIn) return redirectTo(request, "/admin/sign-in", response);
  if (user && isSignIn) return redirectTo(request, "/admin", response);
  return response;
}

function redirectTo(request: NextRequest, path: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  // Keep any refreshed auth cookies on the redirect response.
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

export const config = {
  // Only the admin area runs the proxy; the public site never pays for an auth
  // round-trip. The admin page re-checks the session itself and the database
  // enforces who may read bookings, so this is not the only line of defence.
  matcher: ["/admin", "/admin/:path*"],
};
