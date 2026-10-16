import type { DomainTileState } from "@border-empires/game-domain";
import { describe, expect, it, vi } from "vitest";

import type { ResourceSlotDormancy, ResourceSlotTotals } from "../resource-slot-view/resource-slot-view.js";
import { AI_DERIVED_CACHE_COALESCE_MS } from "../runtime/runtime-economy.js";
import type { RuntimePlayer } from "../runtime-types.js";
import { RuntimeEconomyCaches } from "./runtime-economy-caches.js";

const totals = (food: number): ResourceSlotTotals => ({ FOOD: food, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 });
const dormantFood = (key: string): ResourceSlotDormancy => ({ FOOD: new Set([key]), TITANIUM: new Set(), CRYSTAL: new Set(), UMBRITE: new Set() });
const players = new Map([
  ["ai", { id: "ai", isAi: true } as unknown as RuntimePlayer],
  ["human", { id: "human", isAi: false } as unknown as RuntimePlayer]
]);
const claimedTile = (ownerId: string): DomainTileState => ({ x: 1, y: 1, terrain: "LAND", ownerId, ownershipState: "FRONTIER" });

const createCaches = () => {
  let nowMs = 0;
  const caches = new RuntimeEconomyCaches({
    now: () => nowMs,
    isAiPlayer: (playerId) => players.get(playerId)?.isAi === true
  });
  return { caches, advance: (ms: number) => { nowMs += ms; } };
};

describe("RuntimeEconomyCaches resource-slot reads", () => {
  it("serves a clean entry without rebuilding, unless forced fresh", () => {
    const { caches } = createCaches();
    expect(caches.resourceSlotSupply("human", false, () => totals(4)).FOOD).toBe(4);
    const rebuild = vi.fn(() => totals(9));
    expect(caches.resourceSlotSupply("human", false, rebuild).FOOD).toBe(4);
    expect(rebuild).not.toHaveBeenCalled();
    expect(caches.resourceSlotSupply("human", true, rebuild).FOOD).toBe(9);
  });

  it("rebuilds a human's entry on the next read after one of their tiles changes", () => {
    const { caches } = createCaches();
    caches.resourceSlotDemand("human", false, () => totals(1));
    caches.refreshForTileChange("1,1", undefined, claimedTile("human"), players);
    expect(caches.resourceSlotDemand("human", false, () => totals(2)).FOOD).toBe(2);
  });

  it("keeps serving a dirty AI entry until the coalescing window has passed", () => {
    const { caches, advance } = createCaches();
    caches.resourceSlotDormancy("ai", () => dormantFood("stale"));
    caches.refreshForTileChange("1,1", undefined, claimedTile("ai"), players);
    const rebuild = vi.fn(() => dormantFood("fresh"));
    caches.resourceSlotDormancy("ai", rebuild);
    expect(rebuild).not.toHaveBeenCalled();
    advance(AI_DERIVED_CACHE_COALESCE_MS);
    caches.resourceSlotDormancy("ai", rebuild);
    expect(rebuild).toHaveBeenCalledTimes(1);
  });
});
