import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import type { Tile } from "../client-types.js";
import { openDiplomacyForPlayer, SOCIAL_FOCUS_HIGHLIGHT_MS } from "../client-tile-action-diplomacy/client-tile-action-diplomacy.js";

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
  townHasSupportStructure: () => false,
  activeTruceWithPlayer: () => undefined,
  pendingTruceWithPlayer: () => undefined,
  ownerSpawnShieldActive: () => false
} as const;

const rivalTile: Tile = { x: 4, y: 5, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" };
const truceRequest = (fromPlayerId: string, toPlayerId: string) => ({
  id: `truce-${fromPlayerId}-${toPlayerId}`,
  fromPlayerId,
  toPlayerId,
  createdAt: 1,
  expiresAt: Date.now() + 60_000,
  durationHours: 12 as const
});

describe("tile action diplomacy", () => {
  it("offers one Diplomacy action on a rival tile instead of per-duration truce offers", () => {
    const state = createInitialState();
    state.me = "me";

    const actions = menuActionsForSingleTile(state, rivalTile, baseDeps as never);

    expect(actions.filter((action) => action.id === "diplomacy")).toEqual([
      { id: "diplomacy", label: "Diplomacy", detail: "Propose an alliance or truce" }
    ]);
    expect(actions.map((action) => action.id)).not.toContain("offer_truce_12h" as never);
    expect(actions.map((action) => action.id)).not.toContain("offer_truce_24h" as never);
  });

  it("says when your request to that empire is pending", () => {
    const state = createInitialState();
    state.me = "me";
    state.outgoingTruceRequests = [truceRequest("me", "ai-1")];

    const actions = menuActionsForSingleTile(state, rivalTile, baseDeps as never);

    expect(actions.find((action) => action.id === "diplomacy")).toMatchObject({ detail: "Your request is pending" });
  });

  it("floats Diplomacy to the top when that empire sent you a request", () => {
    const state = createInitialState();
    state.me = "me";
    state.incomingTruceRequests = [truceRequest("ai-1", "me")];

    const actions = menuActionsForSingleTile(state, rivalTile, baseDeps as never);

    expect(actions.find((action) => action.id === "diplomacy")).toMatchObject({
      detail: "They sent you a request -- respond",
      recommended: true
    });
  });

  it("is not affected by requests or truces with a different empire", () => {
    const state = createInitialState();
    state.me = "me";
    state.outgoingTruceRequests = [truceRequest("me", "ai-2")];
    state.activeTruces = [{ otherPlayerId: "ai-2", otherPlayerName: "AI 2", startedAt: 1, endsAt: Date.now() + 60_000, createdByPlayerId: "me" }];

    const actions = menuActionsForSingleTile(state, rivalTile, baseDeps as never);

    expect(actions.find((action) => action.id === "diplomacy")).toMatchObject({ detail: "Propose an alliance or truce" });
    expect(actions.find((action) => action.id === "break_truce")).toBeUndefined();
  });

  it("shows the truce and keeps Break Truce when a truce is active with that empire", () => {
    const state = createInitialState();
    state.me = "me";

    const actions = menuActionsForSingleTile(state, rivalTile, {
      ...baseDeps,
      activeTruceWithPlayer: (playerId?: string | null) =>
        playerId === "ai-1" ? { otherPlayerId: "ai-1", otherPlayerName: "AI 1", startedAt: 1, endsAt: Date.now() + 60_000, createdByPlayerId: "me" } : undefined
    } as never);

    expect(actions.find((action) => action.id === "diplomacy")).toMatchObject({ detail: "Truce active" });
    expect(actions.find((action) => action.id === "break_truce")).toMatchObject({ label: "Break Truce", disabled: false });
  });

  it("offers Diplomacy on an ally's tile, where there were no diplomacy actions before", () => {
    const state = createInitialState();
    state.me = "me";
    state.allies = ["ai-1"];

    const actions = menuActionsForSingleTile(state, rivalTile, { ...baseDeps, isTileOwnedByAlly: () => true } as never);

    expect(actions[0]).toMatchObject({ id: "diplomacy", detail: "Allied" });
  });

  it("never offers diplomacy on a barbarian-owned tile, including the settled barbarian-1 id", () => {
    const state = createInitialState();
    state.me = "me";

    for (const ownerId of ["barbarian", "barbarian-1"]) {
      const tile: Tile = { x: 4, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED" };
      const actions = menuActionsForSingleTile(state, tile, baseDeps as never);

      expect(actions.find((action) => action.id === "diplomacy")).toBeUndefined();
      expect(actions.find((action) => action.id === "break_truce")).toBeUndefined();
    }
  });
});

describe("openDiplomacyForPlayer", () => {
  it("opens the Alliances panel on the player's card without toggling it closed", () => {
    const state = createInitialState();
    state.activePanel = "alliance";

    openDiplomacyForPlayer(state, "ai-1", false, 1_000);

    expect(state.activePanel).toBe("alliance");
    expect(state.socialFocus).toEqual({ playerId: "ai-1", until: 1_000 + SOCIAL_FOCUS_HIGHLIGHT_MS, scrollPending: true });
  });

  it("switches the mobile sheet to Alliances only on a mobile viewport", () => {
    const desktop = createInitialState();
    const before = desktop.mobilePanel;
    openDiplomacyForPlayer(desktop, "ai-1", false);
    expect(desktop.mobilePanel).toBe(before);

    const mobile = createInitialState();
    openDiplomacyForPlayer(mobile, "ai-1", true);
    expect(mobile.mobilePanel).toBe("social");
  });
});
