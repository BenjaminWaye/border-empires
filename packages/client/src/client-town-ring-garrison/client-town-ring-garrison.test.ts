// Regression: Garrison on a town priced and garrisoned only the town tile, leaving the tiles around it
// (which the town's reach claims on its own) for the player to garrison one by one. Garrison on a town now
// costs the town plus its ring, and garrisons the ring right after the town lands SETTLED.
import { SETTLE_COST } from "@border-empires/shared";
import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "../client-tile-action-logic/client-tile-action-logic.js";
import type { Tile } from "../client-types.js";
import {
  TOWN_RING_AFTER_SETTLE_WINDOW_MS,
  TOWN_RING_GARRISON_MAX_ENTRIES,
  processTownRingGarrisons,
  registerTownRingGarrison,
  requestGarrisonWithTownRing,
  townRingGarrisonTiles
} from "./client-town-ring-garrison.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const TX = 10;
const TY = 10;

const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as Tile;

/** A frontier town at (10,10) with a ring of: 5 neutral land, 1 own frontier, 1 own settled, 1 enemy tile. */
const setup = () => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  state.settleManpowerCost = 5;
  const town = land(TX, TY, { ownerId: "me", ownershipState: "FRONTIER", town: { name: "Ash", type: "FARMING", populationTier: "TOWN" } as NonNullable<Tile["town"]> });
  state.tiles.set(keyFor(TX, TY), town);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx || dy) state.tiles.set(keyFor(TX + dx, TY + dy), land(TX + dx, TY + dy));
  state.tiles.set(keyFor(TX + 1, TY), land(TX + 1, TY, { ownerId: "me", ownershipState: "FRONTIER" }));
  state.tiles.set(keyFor(TX - 1, TY), land(TX - 1, TY, { ownerId: "me", ownershipState: "SETTLED" }));
  state.tiles.set(keyFor(TX, TY + 1), land(TX, TY + 1, { ownerId: "enemy", ownershipState: "SETTLED" }));
  return { state, town };
};

const menuDeps = {
  keyFor,
  parseKey: (k: string) => { const [x, y] = k.split(",").map(Number); return { x, y }; },
  wrapX: (x: number) => x, wrapY: (y: number) => y, terrainAt: () => "LAND" as const, chebyshevDistanceClient: () => 0,
  isTileOwnedByAlly: () => false, hostileObservatoryProtectingTile: () => undefined, abilityCooldownRemainingMs: () => 0,
  formatCooldownShort: () => "", pushFeed: () => undefined, hideTileActionMenu: () => undefined, selectedTile: () => undefined,
  renderHud: () => undefined, requireAuthedSession: () => true, ws: { readyState: 1, send: () => undefined },
  attackPreviewDetailForTarget: () => undefined, attackPreviewPendingForTarget: () => false, attackPreviewManpowerCostForTarget: () => undefined,
  pickOriginForTarget: () => ({ x: 0, y: 0 }), buildDetailTextForAction: () => undefined,
  developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }), developmentSlotReason: () => "",
  structureGoldCost: () => 0, structureCostText: () => "", supportedOwnedTownsForTile: () => [], supportedOwnedDocksForTile: () => [],
  townHasSupportStructure: () => false, activeTruceWithPlayer: () => undefined, pendingTruceWithPlayer: () => undefined,
  ownerSpawnShieldActive: () => false, connectedOwnedFrontierKeysFor: () => []
} as const;

describe("town ring garrison", () => {
  it("counts neutral and own-frontier ring tiles, not garrisoned or enemy ones", () => {
    const { state, town } = setup();
    expect(townRingGarrisonTiles(state, town)).toHaveLength(6);
    expect(townRingGarrisonTiles(state, land(TX + 1, TY, { ownerId: "me", ownershipState: "FRONTIER" }))).toHaveLength(0);
  });

  it("prices a town's Garrison as the town plus every tile around it", () => {
    const { state, town } = setup();
    const garrison = menuActionsForSingleTile(state, town, menuDeps as never).find((a) => a.id === "settle_land");
    expect(garrison?.cost).toContain(`${7 * SETTLE_COST} coin, ${7 * 5} manpower (town + 6 around)`);
    expect(garrison?.detail).toContain("Then garrisons the 6 tiles around it");
  });

  it("garrisons the ring only after the town lands SETTLED, as each tile becomes in-reach frontier", () => {
    const { state, town } = setup();
    const requestSettlement = vi.fn(() => true);
    expect(requestGarrisonWithTownRing(state, town, requestSettlement, 0)).toBe(true);
    expect(requestSettlement).toHaveBeenCalledTimes(1);
    expect(requestSettlement).toHaveBeenLastCalledWith(TX, TY);

    const reach = new Set<string>([keyFor(TX + 1, TY), keyFor(TX + 1, TY + 1)]);
    const deps = { now: 1_000, reach, isSettling: () => false, requestSettlement };
    processTownRingGarrisons(state, deps);
    expect(requestSettlement).toHaveBeenCalledTimes(1); // town not garrisoned yet: ring waits

    state.tiles.set(keyFor(TX, TY), { ...town, ownershipState: "SETTLED" });
    processTownRingGarrisons(state, { ...deps, now: 2_000 });
    expect(requestSettlement).toHaveBeenCalledTimes(2);
    expect(requestSettlement).toHaveBeenLastCalledWith(TX + 1, TY);

    // The town's reach claims a neutral ring tile: it is garrisoned on the next tick.
    state.tiles.set(keyFor(TX + 1, TY + 1), land(TX + 1, TY + 1, { ownerId: "me", ownershipState: "FRONTIER" }));
    processTownRingGarrisons(state, { ...deps, now: 3_000 });
    expect(requestSettlement).toHaveBeenCalledTimes(3);
    expect(requestSettlement).toHaveBeenLastCalledWith(TX + 1, TY + 1);
    expect(state.townRingGarrisons.get(keyFor(TX, TY))?.ringKeys).toHaveLength(4);

    // Tiles the reach never claims are dropped once the window after the town's garrison passes.
    processTownRingGarrisons(state, { ...deps, now: 2_000 + TOWN_RING_AFTER_SETTLE_WINDOW_MS + 1 });
    expect(state.townRingGarrisons.size).toBe(0);
  });

  it("does not queue a ring for a plain tile, and caps how many towns are tracked", () => {
    const { state, town } = setup();
    requestGarrisonWithTownRing(state, land(TX + 1, TY, { ownerId: "me", ownershipState: "FRONTIER" }), () => true, 0);
    expect(state.townRingGarrisons.size).toBe(0);
    for (let i = 0; i < TOWN_RING_GARRISON_MAX_ENTRIES; i += 1) state.townRingGarrisons.set(`old-${i}`, { ringKeys: ["x"], startedAt: i });
    expect(registerTownRingGarrison(state, town, 100)).toBe(6);
    expect(state.townRingGarrisons.size).toBe(TOWN_RING_GARRISON_MAX_ENTRIES);
    expect(state.townRingGarrisons.has("old-0")).toBe(false);
    expect(state.townRingGarrisons.has(keyFor(TX, TY))).toBe(true);
  });
});
