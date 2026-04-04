import { describe, expect, it } from "vitest";
import { createAiIndexStore } from "./ai-index-store.js";

describe("createAiIndexStore", () => {
  it("invalidates all per-player caches when territory becomes dirty", () => {
    const store = createAiIndexStore<{ version: number }, { ready: boolean }, { pending: boolean }, { focus: string }>();
    store.territoryStructureByPlayer.set("p1", { version: 1 });
    store.planningStaticByPlayer.set("p1", { ready: true });
    store.settlementSelectorByPlayer.set("p1", { pending: true });
    store.strategicStateByPlayer.set("p1", { focus: "BALANCED" });

    store.markTerritoryDirtyForPlayers(["p1"]);

    expect(store.territoryVersionForPlayer("p1")).toBe(1);
    expect(store.territoryStructureByPlayer.has("p1")).toBe(false);
    expect(store.planningStaticByPlayer.has("p1")).toBe(false);
    expect(store.settlementSelectorByPlayer.has("p1")).toBe(false);
    expect(store.strategicStateByPlayer.has("p1")).toBe(false);
  });
});
