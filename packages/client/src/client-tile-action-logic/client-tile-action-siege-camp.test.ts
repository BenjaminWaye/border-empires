/**
 * A fresh siege build steps down to the best tier whose UMBRITE slots fit
 * (siegeTierForFreshBuild, mirrored server-side): a player with Siegecraft
 * who can't cover a Siege Tower's 2 UMBRITE slots is offered an enabled
 * "Build Siege Battery" instead of a disabled Siege Tower.
 */
import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const deps = {
  keyFor,
  parseKey: (k: string) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  },
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  terrainAt: () => "LAND" as const,
  chebyshevDistanceClient: () => 0,
  isTileOwnedByAlly: () => false,
  hostileObservatoryProtectingTile: () => undefined,
  abilityCooldownRemainingMs: () => 0,
  formatCooldownShort: () => "",
  pushFeed: () => undefined,
  hideTileActionMenu: () => undefined,
  selectedTile: () => undefined,
  renderHud: () => undefined,
  requireAuthedSession: () => true,
  ws: { readyState: 1, send: () => undefined },
  attackPreviewDetailForTarget: () => undefined,
  attackPreviewPendingForTarget: () => false,
  attackPreviewManpowerCostForTarget: () => undefined,
  pickOriginForTarget: () => ({ x: 0, y: 0 }),
  buildDetailTextForAction: () => "",
  developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }),
  developmentSlotReason: () => "",
  structureGoldCost: () => 0,
  structureCostText: () => "",
  supportedOwnedTownsForTile: () => [],
  supportedOwnedDocksForTile: () => [],
  townHasSupportStructure: () => false,
  activeTruceWithPlayer: () => undefined,
  pendingTruceWithPlayer: () => undefined,
  ownerSpawnShieldActive: () => false,
  connectedOwnedFrontierKeysFor: () => []
} as const;

const siegeCampFor = (umbriteSlots: number, techIds: string[] = ["leatherworking", "siegecraft"]) => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  state.techIds = techIds;
  state.resourceSlots = {
    supply: { FOOD: 10, TITANIUM: 0, CRYSTAL: 0, UMBRITE: umbriteSlots },
    demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
  };
  state.tiles.set(keyFor(0, 0), {
    x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
    town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
  } as Tile);
  const target = { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
  state.tiles.set(keyFor(1, 1), target);
  return menuActionsForSingleTile(state, target, deps as never).find((action) => action.id === "build_siege_camp");
};

describe("build_siege_camp tier fallback", () => {
  it("offers a Siege Tower on UMBRITE slots alone (no TITANIUM)", () => {
    const action = siegeCampFor(2);
    expect(action?.label).toBe("Build Siege Tower");
    expect(action?.disabled).toBeFalsy();
  });

  it("offers an enabled Siege Battery when a Siege Tower's UMBRITE slots don't fit, saying why", () => {
    const action = siegeCampFor(1);
    expect(action?.label).toBe("Build Siege Battery");
    expect(action?.disabled).toBeFalsy();
    expect(action?.cost).toContain("Siege Tower: Need 2 free UMBRITE slots (have 1)");
  });

  it("stays disabled on the best tier when not even a Siege Battery fits", () => {
    const action = siegeCampFor(0);
    expect(action?.label).toBe("Build Siege Tower");
    expect(action?.disabled).toBe(true);
  });
});
