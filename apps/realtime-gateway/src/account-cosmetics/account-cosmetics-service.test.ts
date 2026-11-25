import { describe, expect, it } from "vitest";

import { createAccountCosmeticsService } from "./account-cosmetics-service.js";
import { InMemoryAccountCosmeticsStore } from "./account-cosmetics-store.js";

// By default every call to the clock is ten seconds later, so tests that
// change looks several times are never rate-limited; pass `now` to pin it.
const build = (store = new InMemoryAccountCosmeticsStore(), now?: () => number) => {
  const broadcasts: unknown[] = [];
  const direct: Array<[string, unknown]> = [];
  let tick = 0;
  const service = createAccountCosmeticsService({
    store,
    broadcastToAll: (payload) => broadcasts.push(payload),
    sendToPlayer: (playerId, payload) => direct.push([playerId, payload]),
    now: now ?? (() => (tick += 10_000))
  });
  const send = async (playerId: string | undefined, message: Parameters<typeof service.handleClientMessage>[1]) => {
    const replies: unknown[] = [];
    await service.handleClientMessage(playerId, message, (payload) => replies.push(payload));
    return replies;
  };
  return { service, store, broadcasts, direct, send };
};

describe("account cosmetics service", () => {
  it("reports what an account owns and shows", async () => {
    const { service, send } = build();
    await service.grant("p1", "flag-high-noble", "admin");
    expect(await send("p1", { type: "REQUEST_COSMETICS" })).toEqual([{ type: "COSMETICS_STATE", owned: ["flag-high-noble"], selected: {} }]);
  });

  it("refuses a cosmetic the account does not own, and tells nobody", async () => {
    const { send, broadcasts, service } = build();
    const replies = await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-high-noble" });
    expect(replies).toEqual([{ type: "ERROR", code: "COSMETIC_NOT_OWNED", message: "Your account does not own that cosmetic." }]);
    expect(broadcasts).toEqual([]);
    expect(service.shownSelections()).toEqual({});
  });

  it("refuses unknown slots and unknown ids", async () => {
    const { send, service, broadcasts } = build();
    await service.grant("p1", "flag-high-noble", "admin");
    for (const message of [
      { type: "SET_COSMETIC", slot: "crest", cosmeticId: "flag-high-noble" },
      { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-unknown" }
    ] as const) {
      expect(((await send("p1", message))[0] as { code: string }).code).toBe("COSMETIC_INVALID");
    }
    expect(broadcasts).toEqual([]);
  });

  it("requires a signed-in player", async () => {
    const { send } = build();
    expect(((await send(undefined, { type: "REQUEST_COSMETICS" }))[0] as { code: string }).code).toBe("NO_AUTH");
  });

  it("shows an owned cosmetic to everyone and back to default with null", async () => {
    const { send, service, broadcasts } = build();
    await service.grant("p1", "flag-high-noble", "admin");
    const replies = await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-high-noble" });
    expect(replies).toEqual([{ type: "COSMETICS_STATE", owned: ["flag-high-noble"], selected: { musterFlag: "flag-high-noble" } }]);
    expect(broadcasts).toEqual([{ type: "PLAYER_STYLE", playerId: "p1", cosmetics: { musterFlag: "flag-high-noble" } }]);
    expect(service.shownSelections()).toEqual({ p1: { musterFlag: "flag-high-noble" } });

    await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: null });
    expect(broadcasts[1]).toEqual({ type: "PLAYER_STYLE", playerId: "p1", cosmetics: {} });
    expect(service.shownSelections()).toEqual({});
  });

  it("grant is idempotent, rejects unknown ids, and tells the owner's sockets once", async () => {
    const { service, direct } = build();
    expect(await service.grant("p1", "nope", "admin")).toEqual({ ok: false, error: "unknown_cosmetic" });
    expect(await service.grant("", "flag-high-noble", "admin")).toEqual({ ok: false, error: "invalid_player" });
    expect(await service.grant("p1", "flag-high-noble", "admin")).toEqual({ ok: true, newlyGranted: true, owned: ["flag-high-noble"] });
    expect(await service.grant("p1", "flag-high-noble", "admin")).toEqual({ ok: true, newlyGranted: false, owned: ["flag-high-noble"] });
    expect(direct).toEqual([["p1", { type: "COSMETICS_STATE", owned: ["flag-high-noble"], selected: {} }]]);
  });

  it("revoking a shown cosmetic returns everyone's view to the default look", async () => {
    const { service, send, broadcasts } = build();
    await service.grant("p1", "flag-high-noble", "admin");
    await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-high-noble" });
    await service.revoke("p1", "flag-high-noble");
    expect(broadcasts.at(-1)).toEqual({ type: "PLAYER_STYLE", playerId: "p1", cosmetics: {} });
    expect(service.shownSelections()).toEqual({});
  });

  it("loads looks chosen before this boot", async () => {
    const store = new InMemoryAccountCosmeticsStore();
    await store.setSelection("p9", "musterFlag", "flag-high-noble");
    const { service } = build(store);
    expect(service.shownSelections()).toEqual({});
    await service.hydrate();
    expect(service.shownSelections()).toEqual({ p9: { musterFlag: "flag-high-noble" } });
  });

  it("reports gauges for owned, selected and shown counts", async () => {
    const { service, send } = build();
    await service.grant("p1", "flag-high-noble", "admin");
    await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-high-noble" });
    const text = await service.renderMetrics();
    expect(text).toContain("gateway_account_cosmetics_owned 1");
    expect(text).toContain("gateway_account_cosmetics_selected 1");
    expect(text).toContain("gateway_account_cosmetics_shown_accounts 1");
    expect(text).toContain("gateway_account_cosmetics_shown_cap_rejections_total 0");
  });

  it("grants everything in the title of Count in one purchase, once", async () => {
    const { service } = build();
    // Destructured on purpose: the payment webhook may hold the method alone.
    const { grantProduct } = service;
    expect(await grantProduct("p1", "title-count", "payment-1")).toEqual({
      ok: true,
      newlyGranted: true,
      owned: expect.arrayContaining(["ancillaries-lancet-guard", "flag-high-noble"])
    });
    expect(await grantProduct("p1", "title-count", "payment-1")).toMatchObject({ ok: true, newlyGranted: false });
    expect(await grantProduct("p1", "no-such-product", "payment-2")).toEqual({ ok: false, error: "unknown_product" });
    expect(await grantProduct("", "title-count", "payment-3")).toEqual({ ok: false, error: "invalid_player" });
  });

  it("names an account Count once it owns the whole product, and not after a refund", async () => {
    const { service } = build();
    expect(await service.titleOf("p1")).toBeUndefined();
    await service.grantProduct("p1", "title-count", "payment-1");
    expect(await service.titleOf("p1")).toBe("Count");
    await service.revoke("p1", "ancillaries-lancet-guard");
    expect(await service.titleOf("p1")).toBeUndefined();
  });

  it("broadcasts nothing for a change to the look already shown, and limits how often a look changes", async () => {
    let clock = 0;
    const { service, send, broadcasts } = build(undefined, () => clock);
    await service.grant("p1", "flag-high-noble", "admin");
    // Clearing an empty slot, as any account could spam, reaches nobody.
    for (let i = 0; i < 5; i += 1) await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: null });
    expect(broadcasts).toEqual([]);

    await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-high-noble" });
    expect(broadcasts).toHaveLength(1);
    const tooSoon = await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: null });
    expect(tooSoon).toEqual([{ type: "ERROR", code: "COSMETIC_RATE_LIMITED", message: "Wait a moment before changing your look again." }]);
    expect(broadcasts).toHaveLength(1);

    clock += 1_000;
    await send("p1", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: null });
    expect(broadcasts).toHaveLength(2);
  });
});
