import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
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
  pickOriginForTarget: () => undefined,
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
  ownerSpawnShieldActive: () => false
} as const;

describe("tile action truce state", () => {
  it("shows pending outgoing truces in the action menu and disables duplicate offers", () => {
    const state = createInitialState();
    state.me = "me";
    const tile: Tile = { x: 4, y: 5, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" };

    const actions = menuActionsForSingleTile(state, tile, {
      ...baseDeps,
      pendingTruceWithPlayer: (playerId?: string | null) => (playerId === "ai-1" ? "outgoing" : undefined)
    } as never);

    expect(actions.find((action) => action.id === "offer_truce_12h")).toMatchObject({
      label: "Truce Offer Pending",
      disabled: true,
      disabledReason: "Truce offer already pending",
      cost: "Pending"
    });
    expect(actions.find((action) => action.id === "offer_truce_24h")).toMatchObject({
      label: "Truce Already Pending",
      disabled: true,
      disabledReason: "Truce offer already pending",
      cost: "Pending"
    });
  });

  it("shows incoming pending truces in the action menu instead of another offer", () => {
    const state = createInitialState();
    state.me = "me";
    const tile: Tile = { x: 4, y: 5, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" };

    const actions = menuActionsForSingleTile(state, tile, {
      ...baseDeps,
      pendingTruceWithPlayer: (playerId?: string | null) => (playerId === "ai-1" ? "incoming" : undefined)
    } as never);

    expect(actions.find((action) => action.id === "offer_truce_12h")).toMatchObject({
      label: "Respond in Social Panel",
      disabled: true,
      disabledReason: "Incoming truce offer pending",
      cost: "Pending"
    });
  });

  it("never offers a truce on a barbarian-owned tile, including the settled barbarian-1 id", () => {
    const state = createInitialState();
    state.me = "me";

    for (const ownerId of ["barbarian", "barbarian-1"]) {
      const tile: Tile = { x: 4, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED" };
      const actions = menuActionsForSingleTile(state, tile, baseDeps as never);

      expect(actions.find((action) => action.id === "offer_truce_12h")).toBeUndefined();
      expect(actions.find((action) => action.id === "offer_truce_24h")).toBeUndefined();
      expect(actions.find((action) => action.id === "break_truce")).toBeUndefined();
    }
  });

  it("disables truce offers to other empires when any outgoing truce is pending", () => {
    const state = createInitialState();
    state.me = "me";
    state.outgoingTruceRequests = [
      {
        id: "truce-1",
        fromPlayerId: "me",
        toPlayerId: "ai-2",
        createdAt: 1,
        expiresAt: Date.now() + 60_000,
        durationHours: 12,
        toName: "AI 2"
      }
    ];
    const tile: Tile = { x: 4, y: 5, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" };

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);

    expect(actions.find((action) => action.id === "offer_truce_12h")).toMatchObject({
      label: "Truce Offer Pending",
      disabled: true,
      disabledReason: "You already have a pending truce offer",
      cost: "Pending"
    });
  });
});
