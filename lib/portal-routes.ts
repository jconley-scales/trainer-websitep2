/**
 * URL prefixes that make up the signed-in client portal (the `app/(portal)`
 * route group). proxy.ts redirects signed-out visitors away from these; every
 * other page is public.
 *
 * IMPORTANT: when adding a new portal route, add its top-level segment here, or
 * it will be public. tests/auth/portal-routes.test.ts fails if one is missed.
 */
export const PROTECTED_PREFIXES = ["/sessions", "/book"];
