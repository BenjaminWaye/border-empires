// The hosting service grants a bought cosmetic by the buyer's Firebase uid,
// with a key that can do nothing else (plan section 15, step 8e).
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { accountTitleFor } from "@border-empires/shared";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { registerAccountCosmeticsPurchaseRoutes } from "./account-cosmetics-purchase-routes.js";
import { createAccountCosmeticsService } from "./account-cosmetics-service.js";
import { InMemoryAccountCosmeticsStore } from "./account-cosmetics-store.js";

const KEY = "k".repeat(40);

const build = async () => {
  const store = new InMemoryAccountCosmeticsStore();
  const cosmetics = createAccountCosmeticsService({ store, broadcastToAll: () => undefined, sendToPlayer: () => undefined });
  const bindings = new InMemoryGatewayAuthBindingStore();
  await bindings.bindIdentity({ uid: "uid-buyer", playerId: "player-7" });
  const app = Fastify();
  registerAccountCosmeticsPurchaseRoutes(app, { grantToken: KEY, authBindingStore: bindings, cosmetics });
  return { app, store };
};

const headers = { authorization: `Bearer ${KEY}` };

describe("granting a bought cosmetic", () => {
  it("says whether the account already owns the product, so it is not sold twice", async () => {
    const { app } = await build();
    const status = async (uid: string) => (await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-status", headers, payload: { uid, productId: "title-count" } })).json();
    expect(await status("uid-buyer")).toEqual({ ok: true, owned: false });
    expect(await status("uid-never-played")).toEqual({ ok: true, owned: false });
    await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-grant", headers, payload: { uid: "uid-buyer", productId: "title-count" } });
    expect(await status("uid-buyer")).toEqual({ ok: true, owned: true });
    expect((await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-status", payload: { uid: "uid-buyer", productId: "title-count" } })).statusCode).toBe(401);
  });

  it("grants the whole product to the account behind the uid, once, and the title with it", async () => {
    const { app, store } = await build();
    const first = await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-grant", headers, payload: { uid: "uid-buyer", productId: "title-count", grantRef: "cos-1" } });
    expect(first.json()).toEqual({ ok: true, newlyGranted: true });
    const again = await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-grant", headers, payload: { uid: "uid-buyer", productId: "title-count", grantRef: "cos-1" } });
    expect(again.json()).toEqual({ ok: true, newlyGranted: false });
    expect(accountTitleFor(await store.listOwned("player-7"))).toBe("Count");
    await app.close();
  });

  it("takes the product and its title back on a refund", async () => {
    const { app, store } = await build();
    await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-grant", headers, payload: { uid: "uid-buyer", productId: "title-count" } });
    const revoked = await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-revoke", headers, payload: { uid: "uid-buyer", productId: "title-count" } });
    expect(revoked.json()).toEqual({ ok: true });
    expect(await store.listOwned("player-7")).toEqual([]);
    await app.close();
  });

  it("refuses any other key, an unknown product, and an account that has never played", async () => {
    const { app, store } = await build();
    for (const authorization of ["", "Bearer wrong", `Bearer ${KEY}x`, KEY]) {
      const response = await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-grant", headers: authorization ? { authorization } : {}, payload: { uid: "uid-buyer", productId: "title-count" } });
      expect(response.statusCode).toBe(401);
    }
    expect((await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-grant", headers, payload: { uid: "uid-buyer", productId: "flag-high-noble" } })).statusCode).toBe(400);
    const unknown = await app.inject({ method: "POST", url: "/admin/cosmetics/purchase-grant", headers, payload: { uid: "uid-stranger", productId: "title-count" } });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ ok: false, error: "no_player" });
    expect(await store.listOwned("player-7")).toEqual([]);
    await app.close();
  });

  it("refuses to start with a short key", () => {
    expect(() => registerAccountCosmeticsPurchaseRoutes(Fastify(), { grantToken: "short", authBindingStore: new InMemoryGatewayAuthBindingStore(), cosmetics: {} as never })).toThrow(/at least 32/);
  });
});
