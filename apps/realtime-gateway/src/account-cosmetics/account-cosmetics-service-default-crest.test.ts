import { describe, expect, it } from "vitest";

import { createAccountCosmeticsService } from "./account-cosmetics-service.js";
import { InMemoryAccountCosmeticsStore } from "./account-cosmetics-store.js";

// First-15 round 1 (2026-11-28): AI and guest Houses showed only a letter.
const build = (store = new InMemoryAccountCosmeticsStore()) => {
  const broadcasts: unknown[] = [];
  const logs: string[] = [];
  let tick = 0;
  const service = createAccountCosmeticsService({
    store,
    broadcastToAll: (payload) => broadcasts.push(payload),
    sendToPlayer: () => undefined,
    log: (message) => logs.push(message),
    now: () => (tick += 10_000),
    getCurrentSeasonId: async () => "season-1"
  });
  return { service, store, broadcasts, logs };
};

describe("assignDefaultCrest", () => {
  it("gives a House with no crest one, shows it to everyone, and leaves its crest change unspent", async () => {
    const { service, broadcasts } = build();
    await expect(service.assignDefaultCrest("guest-a", "crest-kraken")).resolves.toBe(true);
    expect(service.shownSelectionFor("guest-a")).toEqual({ crest: "crest-kraken" });
    expect(broadcasts).toEqual([{ type: "PLAYER_STYLE", playerId: "guest-a", cosmetics: { crest: "crest-kraken" } }]);
    const replies: unknown[] = [];
    await service.handleClientMessage("guest-a", { type: "SET_COSMETIC", slot: "crest", cosmeticId: "crest-stag" }, (payload) => replies.push(payload));
    expect(replies[0]).toMatchObject({ type: "COSMETICS_STATE", selected: { crest: "crest-stag" }, crestChangeUsed: true });
    expect(await service.renderMetrics()).toContain("gateway_account_cosmetics_default_crests_assigned_total 1");
  });

  it("never replaces a crest the House already shows", async () => {
    const store = new InMemoryAccountCosmeticsStore();
    await store.setSelection("ai-1", "crest", "crest-anchor");
    const { service, broadcasts } = build(store);
    await service.hydrate();
    await expect(service.assignDefaultCrest("ai-1", "crest-cog")).resolves.toBe(false);
    expect(service.shownSelectionFor("ai-1")).toEqual({ crest: "crest-anchor" });
    expect(broadcasts).toEqual([]);
  });

  it("never throws: a failing store is logged and counted", async () => {
    const store = new InMemoryAccountCosmeticsStore();
    store.setSelection = async () => {
      throw new Error("disk full");
    };
    const { service, logs } = build(store);
    await expect(service.assignDefaultCrest("guest-b", "crest-cog")).resolves.toBe(false);
    expect(logs).toContain("default House crest not assigned");
    expect(await service.renderMetrics()).toContain("gateway_account_cosmetics_default_crest_failures_total 1");
  });
});
