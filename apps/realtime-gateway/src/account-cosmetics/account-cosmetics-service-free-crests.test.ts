import { describe, expect, it } from "vitest";

import { createAccountCosmeticsService } from "./account-cosmetics-service.js";
import { InMemoryAccountCosmeticsStore, MAX_LOADED_COSMETIC_SELECTIONS } from "./account-cosmetics-store.js";

// Free House crests (any account can pick one) must not use up the limit on
// shown paid looks, and admin grant/revoke must leave free crests alone.
const build = (store: InMemoryAccountCosmeticsStore) => {
  const broadcasts: unknown[] = [];
  let tick = 0;
  const service = createAccountCosmeticsService({
    store,
    broadcastToAll: (payload) => broadcasts.push(payload),
    sendToPlayer: () => undefined,
    now: () => (tick += 10_000)
  });
  const send = async (playerId: string, message: Parameters<typeof service.handleClientMessage>[1]) => {
    const replies: unknown[] = [];
    await service.handleClientMessage(playerId, message, (payload) => replies.push(payload));
    return replies;
  };
  return { service, broadcasts, send };
};

const fillWithCrests = async (store: InMemoryAccountCosmeticsStore, count: number) => {
  for (let i = 0; i < count; i += 1) await store.setSelection(`crest-${String(i).padStart(5, "0")}`, "crest", "crest-anchor");
};

describe("account cosmetics with free crests", () => {
  it("still shows a paid flag chosen before boot when more accounts than the limit picked crests", async () => {
    const store = new InMemoryAccountCosmeticsStore();
    await fillWithCrests(store, MAX_LOADED_COSMETIC_SELECTIONS + 1);
    await store.grant("zz-paid", "flag-high-noble", "test");
    await store.setSelection("zz-paid", "musterFlag", "flag-high-noble");
    const { service } = build(store);
    await service.hydrate();
    expect(service.shownSelectionFor("zz-paid")).toEqual({ musterFlag: "flag-high-noble" });
    expect(service.shownSelectionFor("crest-00000")).toEqual({ crest: "crest-anchor" });
    expect(await service.renderMetrics()).toContain("gateway_account_cosmetics_shown_cap_rejections_total 0");
  });

  it("shows a newly chosen paid flag when the crest-only accounts already reach the paid limit", async () => {
    const store = new InMemoryAccountCosmeticsStore();
    await fillWithCrests(store, MAX_LOADED_COSMETIC_SELECTIONS);
    const { service, send } = build(store);
    await service.hydrate();
    await service.grant("late-buyer", "flag-high-noble", "test");
    await send("late-buyer", { type: "SET_COSMETIC", slot: "musterFlag", cosmeticId: "flag-high-noble" });
    expect(service.shownSelectionFor("late-buyer")).toEqual({ musterFlag: "flag-high-noble" });
    // Adding a crest to a paid look keeps it in the paid set.
    await send("late-buyer", { type: "SET_COSMETIC", slot: "crest", cosmeticId: "crest-key" });
    expect(service.shownSelectionFor("late-buyer")).toEqual({ musterFlag: "flag-high-noble", crest: "crest-key" });
  });

  it("ignores an admin revoke or grant of a free crest", async () => {
    const store = new InMemoryAccountCosmeticsStore();
    const { service, send, broadcasts } = build(store);
    await send("p1", { type: "SET_COSMETIC", slot: "crest", cosmeticId: "crest-anchor" });
    expect(await service.revoke("p1", "crest-anchor")).toEqual({ ok: true, newlyGranted: false, owned: [] });
    expect(await store.getSelection("p1")).toEqual({ crest: "crest-anchor" });
    expect(service.shownSelectionFor("p1")).toEqual({ crest: "crest-anchor" });
    expect(broadcasts).toHaveLength(1);
    expect(await service.grant("p1", "crest-anchor", "admin")).toEqual({ ok: true, newlyGranted: false, owned: [] });
    expect(await store.listOwned("p1")).toEqual([]);
  });
});
