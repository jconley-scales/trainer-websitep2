import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const createServerClient = vi.fn(() => ({ auth: { getUser } }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

const { proxy } = await import("@/proxy");

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

beforeEach(() => {
  getUser.mockReset();
  createServerClient.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

describe("proxy route guard", () => {
  it.each(["/", "/medico", "/about", "/sessionsx", "/booking"])(
    "lets the public path %s through without calling Supabase",
    async (path) => {
      const res = await proxy(request(path));
      expect(res.status).toBe(200);
      expect(createServerClient).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/sessions",
    "/sessions/jpg",
    "/book",
    "/book/anything",
    "/%73essions",
    "/%42ook",
    "/Sessions",
    "/book%2Fx",
  ])("redirects %s to /login when signed out", async (path) => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(request(path));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets a signed-in user into the portal", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await proxy(request("/sessions"));
    expect(res.status).toBe(200);
  });

  it("shows /login to a signed-out visitor and bounces a signed-in one to /sessions", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await proxy(request("/login"))).status).toBe(200);

    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await proxy(request("/login"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/sessions");
  });
});
