// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase is stubbed: no network, no real session cookies.
const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const signOut = vi.fn();
const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOtp, verifyOtp, signOut },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from })),
}));

import { sendCode, verifyCode } from "@/app/login/actions";

const USER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
});

describe("sendCode", () => {
  it("requests an email one-time code (not a magic link)", async () => {
    signInWithOtp.mockResolvedValue({ error: null });
    const result = await sendCode("  Pat@Example.com ");
    expect(result).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "pat@example.com",
      options: { shouldCreateUser: true },
    });
  });

  it("rejects an invalid email without calling Supabase", async () => {
    const result = await sendCode("not-an-email");
    expect(result.ok).toBe(false);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns a plain-language error when sending fails", async () => {
    signInWithOtp.mockResolvedValue({ error: { message: "rate limit" } });
    const result = await sendCode("pat@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

describe("verifyCode", () => {
  it("fails with an error and creates no session or profile for a wrong/expired code", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Token has expired or is invalid" },
    });
    const result = await verifyCode("pat@example.com", "000000");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/code/i);
      // Raw provider messages are not leaked to the user.
      expect(result.error).not.toMatch(/token/i);
    }
    expect(upsert).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("does not report success when no session comes back", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    const result = await verifyCode("pat@example.com", "123456");
    expect(result.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed code without calling Supabase", async () => {
    const result = await verifyCode("pat@example.com", "12ab");
    expect(result.ok).toBe(false);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("succeeds for a valid code and upserts a client profile", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: USER_ID }, session: { access_token: "t" } },
      error: null,
    });
    const result = await verifyCode(" Pat@Example.com", " 123 456 ");
    expect(result).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "pat@example.com",
      token: "123456",
      type: "email",
    });
    expect(from).toHaveBeenCalledWith("profiles");
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, options] = upsert.mock.calls[0];
    expect(row).toEqual({ id: USER_ID, role: "client" });
    // Never overwrite an existing profile (e.g. a trainer keeps their role).
    expect(options).toMatchObject({ onConflict: "id", ignoreDuplicates: true });
  });

  it("signs the user back out and reports an error if the profile cannot be saved", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { id: USER_ID }, session: { access_token: "t" } },
      error: null,
    });
    upsert.mockResolvedValue({ error: { message: "db down" } });
    const result = await verifyCode("pat@example.com", "123456");
    expect(result.ok).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });
});
