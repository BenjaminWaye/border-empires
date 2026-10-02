import { describe, expect, it, vi } from "vitest";

import { createAdminApi } from "./admin-api.js";

const response = (status: number, body: string, contentType = "application/json"): Response =>
  new Response(body, { status, headers: { "content-type": contentType } });

describe("createAdminApi", () => {
  it("sends the ID token as a Bearer header to this deployment's gateway", async () => {
    const fetchImpl = vi.fn(async () => response(200, '{"ok":true}'));
    const api = createAdminApi("https://gw.example.test", async () => "id-token", fetchImpl as unknown as typeof fetch);
    await expect(api.get("/admin/players")).resolves.toEqual({ ok: true, contentType: "application/json", body: '{"ok":true}' });
    expect(fetchImpl).toHaveBeenCalledWith("https://gw.example.test/admin/players", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer id-token" }) }));
  });

  it("explains a 401 as 'not the admin account' and never calls out when signed out", async () => {
    const fetchImpl = vi.fn(async () => response(401, '{"ok":false}'));
    const api = createAdminApi("https://gw.example.test", async () => "id-token", fetchImpl as unknown as typeof fetch);
    const denied = await api.get("/admin/players");
    expect(denied.ok).toBe(false);
    expect(denied.ok ? "" : denied.message).toMatch(/ADMIN_EMAIL/);
    const signedOut = createAdminApi("https://gw.example.test", async () => undefined, fetchImpl as unknown as typeof fetch);
    await expect(signedOut.get("/admin/players")).resolves.toEqual({ ok: false, status: 401, message: "Not signed in." });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports network failures instead of throwing", async () => {
    const api = createAdminApi("https://gw.example.test", async () => "t", (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    await expect(api.get("/admin/players")).resolves.toEqual(expect.objectContaining({ ok: false, status: 0 }));
  });
});
