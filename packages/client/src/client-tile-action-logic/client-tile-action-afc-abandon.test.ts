/**
 * Regression test: "Abandon Territory" must not be offered on your own
 * Automated Fabrication Complex. The sim rejects it (UNCAPTURE_AFC, see
 * runtime-economic-structure-command-handlers.ts) because abandoning the AFC
 * drops its TOWN-radius reach anchor and stamps out-of-reach decay on every
 * frontier tile around it. An inert AFC left behind by another player on a
 * tile you now own is still abandonable.
 */
import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { uncaptureSelected } from "../client-selected-actions/client-selected-actions.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import type { Tile } from "../client-types.js";

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
  pickOriginForTarget: () => ({ x: 0, y: 0 }),
  buildDetailTextForAction: () => undefined,
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

const stateWithTile = (tile: Tile): ReturnType<typeof createInitialState> => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  state.tiles.set(keyFor(tile.x, tile.y), tile);
  return state;
};

const hasAbandon = (tile: Tile): boolean =>
  menuActionsForSingleTile(stateWithTile(tile), tile, baseDeps as never).some((action) => action.id === "abandon_territory");

describe("Abandon Territory on an Automated Fabrication Complex", () => {
  it("is hidden on your own AFC tile", () => {
    expect(
      hasAbandon({ x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active" } })
    ).toBe(false);
  });

  it("is still offered on an ordinary owned tile", () => {
    expect(hasAbandon({ x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" })).toBe(true);
  });

  it("is still offered on a tile carrying another player's inert AFC", () => {
    expect(
      hasAbandon({ x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "someone-else", status: "active" } })
    ).toBe(true);
  });

  it("uncaptureSelected refuses to send UNCAPTURE_TILE for your own AFC", () => {
    const tile: Tile = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active" } };
    const state = stateWithTile(tile);
    state.selected = { x: 5, y: 5 };
    const sendGameMessage = vi.fn(() => true);
    const pushFeed = vi.fn();

    uncaptureSelected(state, { keyFor, pushFeed, renderHud: vi.fn(), sendGameMessage });

    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("You cannot abandon your Automated Fabrication Complex.", "error", "warn");
  });
});
