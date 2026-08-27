import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import type { Tile, TileActionDef } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = {
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
  pickOriginForTarget: () => undefined,
  buildDetailTextForAction: () => undefined,
  developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }),
  developmentSlotReason: () => "",
  structureGoldCost: () => 0,
  structureCostText: () => "",
  supportedOwnedTownsForTile: () => [],
  supportedOwnedDocksForTile: () => [],
  // Every other town-support type is one-per-town, so a naive baseDeps that
  // always answers "yes, town already has one" is a fine default there. It
  // is NOT fine for CRYSTAL_SYNTHESIZER/ADVANCED_CRYSTAL_SYNTHESIZER, which
  // the server exempts from that cap (STACKING_TOWN_SUPPORT_STRUCTURE_TYPES,
  // runtime-structure-town-support-target.ts) -- this stub mirrors that by
  // reporting "true" for every type except the stacking Aether Condenser
  // family, same as a real support-ring lookup would.
  townHasSupportStructure: (_town: unknown, type: string) =>
    type !== "CRYSTAL_SYNTHESIZER" && type !== "ADVANCED_CRYSTAL_SYNTHESIZER",
  activeTruceWithPlayer: () => undefined,
  pendingTruceWithPlayer: () => undefined,
  ownerSpawnShieldActive: () => false
} as const;

const findAction = (actions: TileActionDef[], id: TileActionDef["id"]): TileActionDef | undefined =>
  actions.find((action) => action.id === id);

// Regression: the Aether Condenser (CRYSTAL_SYNTHESIZER) build button stayed
// disabled with "Nearby town already has Aether Condenser" in a town that
// already had one, even though the server exempts this building family from
// the one-per-town cap entirely (a town can host as many as it has open
// support tiles for). The client's build-availability check still gated on
// townHasSupportStructure(..., "CRYSTAL_SYNTHESIZER") like every other
// one-per-town economic building, so Build stayed falsely disabled.
describe("Aether Condenser build button (server-side stacking exemption)", () => {
  it("stays enabled in a town that already has an Aether Condenser", () => {
    const state = createInitialState();
    state.me = "me";
    state.techIds = ["crystal-lattices"];
    state.gold = 10000;
    state.manpower = 1000;

    const townTile: Tile = {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: { populationTier: "CITY" } as never
    } as Tile;
    state.tiles.set(keyFor(5, 5), townTile);

    const supportTile: Tile = {
      x: 6,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED"
    } as Tile;
    state.tiles.set(keyFor(6, 5), supportTile);

    const deps = { ...baseDeps, supportedOwnedTownsForTile: () => [townTile] };
    const actions = menuActionsForSingleTile(state, supportTile, deps as never);
    const build = findAction(actions, "build_crystal_synthesizer" as TileActionDef["id"]);
    expect(build).toBeDefined();
    expect(build?.disabled).not.toBe(true);
  });
});
