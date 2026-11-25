import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { createAdminAuthorizer } from "../admin-auth/admin-auth.js";
import { registerAccountCosmeticsAdminRoutes } from "./account-cosmetics-admin-routes.js";
import { createAccountCosmeticsService } from "./account-cosmetics-service.js";
import { InMemoryAccountCosmeticsStore } from "./account-cosmetics-store.js";

const build = (adminApiToken: string | undefined = "secret") => {
  const store = new InMemoryAccountCosmeticsStore();
  const cosmetics = createAccountCosmeticsService({ store, broadcastToAll: () => undefined, sendToPlayer: () => undefined });
  const app = Fastify();
  const { adminAuthorized } = createAdminAuthorizer({ ...(adminApiToken ? { adminApiToken } : {}) });
  registerAccountCosmeticsAdminRoutes(app, { adminAuthorized, cosmetics });
  return { app, store };
};

const grantBody = { playerId: "p1", cosmeticId: "flag-high-noble" };

describe("account cosmetics admin routes", () => {
  it("cannot be reached without the admin bearer token", async () => {
    const { app, store } = build();
    for (const headers of [{}, { authorization: "Bearer wrong" }, { authorization: "secret" }]) {
      const response = await app.inject({ method: "POST", url: "/admin/cosmetics/grant", headers, payload: grantBody });
      expect(response.statusCode).toBe(401);
    }
    // A token in the query string is not accepted for a state-changing route.
    const viaQuery = await app.inject({ method: "POST", url: "/admin/cosmetics/grant?token=secret", payload: grantBody });
    expect(viaQuery.statusCode).toBe(401);
    expect(await store.listOwned("p1")).toEqual([]);
    await app.close();
  });

  it("is closed entirely when the server has no admin token", async () => {
    const { app, store } = build("");
    const response = await app.inject({ method: "POST", url: "/admin/cosmetics/grant", headers: { authorization: "Bearer " }, payload: grantBody });
    expect(response.statusCode).toBe(401);
    expect(await store.listOwned("p1")).toEqual([]);
    await app.close();
  });

  it("grants and revokes with the admin token", async () => {
    const { app, store } = build();
    const headers = { authorization: "Bearer secret" };
    const granted = await app.inject({ method: "POST", url: "/admin/cosmetics/grant", headers, payload: { ...grantBody, grantRef: "test" } });
    expect(granted.statusCode).toBe(200);
    expect(granted.json()).toEqual({ ok: true, newlyGranted: true, owned: ["flag-high-noble"] });
    expect(await store.listOwned("p1")).toEqual(["flag-high-noble"]);

    const revoked = await app.inject({ method: "POST", url: "/admin/cosmetics/revoke", headers, payload: grantBody });
    expect(revoked.json()).toEqual({ ok: true, newlyGranted: false, owned: [] });
    await app.close();
  });

  it("rejects unknown cosmetics and incomplete bodies", async () => {
    const { app } = build();
    const headers = { authorization: "Bearer secret" };
    const unknown = await app.inject({ method: "POST", url: "/admin/cosmetics/grant", headers, payload: { playerId: "p1", cosmeticId: "nope" } });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ ok: false, error: "unknown_cosmetic" });
    const incomplete = await app.inject({ method: "POST", url: "/admin/cosmetics/grant", headers, payload: { playerId: "p1" } });
    expect(incomplete.statusCode).toBe(400);
    await app.close();
  });

  it("grants a whole shop product with the admin token, and only with it", async () => {
    const { app, store } = build();
    const payload = { playerId: "p1", productId: "title-count", grantRef: "test" };
    const refused = await app.inject({ method: "POST", url: "/admin/cosmetics/grant-product", headers: { authorization: "Bearer wrong" }, payload });
    expect(refused.statusCode).toBe(401);
    expect(await store.listOwned("p1")).toEqual([]);

    const headers = { authorization: "Bearer secret" };
    const granted = await app.inject({ method: "POST", url: "/admin/cosmetics/grant-product", headers, payload });
    expect(granted.statusCode).toBe(200);
    expect(granted.json()).toEqual({ ok: true, newlyGranted: true, owned: expect.arrayContaining(["ancillaries-lancet-guard", "flag-high-noble"]) });
    const unknown = await app.inject({ method: "POST", url: "/admin/cosmetics/grant-product", headers, payload: { playerId: "p1", productId: "nope" } });
    expect(unknown.json()).toEqual({ ok: false, error: "unknown_product" });
    await app.close();
  });
});
