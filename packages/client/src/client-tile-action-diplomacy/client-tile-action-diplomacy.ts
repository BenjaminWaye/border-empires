import type { ClientState } from "../client-state/client-state.js";
import type { ActiveTruceView, TileActionDef } from "../client-types.js";

type DiplomacyActionState = Pick<
  ClientState,
  "allies" | "incomingAllianceRequests" | "outgoingAllianceRequests" | "incomingTruceRequests" | "outgoingTruceRequests"
>;

type DiplomacyActionDeps = {
  activeTruceWithPlayer: (playerId?: string | null) => ActiveTruceView | undefined;
};

/**
 * The single diplomacy entry on another player's tile. It replaces the old
 * "Offer Truce 12h/24h" rows: the Alliances tab owns proposing, so this just
 * says where you stand with the tile's owner and opens that player's row. A
 * request waiting on you floats to the top of the menu.
 */
export const diplomacyActionForOwner = (
  state: DiplomacyActionState,
  ownerId: string,
  deps: DiplomacyActionDeps,
  nowMs: number = Date.now()
): TileActionDef => {
  const awaitingYou =
    state.incomingAllianceRequests.some((request) => request.fromPlayerId === ownerId) ||
    state.incomingTruceRequests.some((request) => request.fromPlayerId === ownerId && request.expiresAt > nowMs);
  const sentByYou =
    state.outgoingAllianceRequests.some((request) => request.toPlayerId === ownerId) ||
    state.outgoingTruceRequests.some((request) => request.toPlayerId === ownerId && request.expiresAt > nowMs);
  const detail = awaitingYou
    ? "They sent you a request -- respond"
    : state.allies.includes(ownerId)
      ? "Allied"
      : deps.activeTruceWithPlayer(ownerId)
        ? "Truce active"
        : sentByYou
          ? "Your request is pending"
          : "Propose an alliance or truce";
  return { id: "diplomacy", label: "Diplomacy", detail, ...(awaitingYou ? { recommended: true } : {}) };
};

/**
 * Opens the Alliances panel (desktop side panel, or the mobile social sheet)
 * and marks the player to scroll to, highlight and expand there. Sets panel state
 * directly rather than via the toggling setActivePanel, so pressing Diplomacy
 * while the panel is already open does not close it. The caller re-renders.
 */
export const openDiplomacyForPlayer = (
  state: Pick<ClientState, "activePanel" | "mobilePanel" | "socialFocus" | "expandedSocialPlayerId">,
  playerId: string,
  isMobileViewport: boolean,
  nowMs: number = Date.now()
): void => {
  state.activePanel = "alliance";
  if (isMobileViewport) state.mobilePanel = "social";
  state.socialFocus = { playerId, until: nowMs + SOCIAL_FOCUS_HIGHLIGHT_MS, scrollPending: true };
  // Open the player's row so its Propose / Truce buttons are ready to tap.
  state.expandedSocialPlayerId = playerId;
};

export const SOCIAL_FOCUS_HIGHLIGHT_MS = 8_000;
