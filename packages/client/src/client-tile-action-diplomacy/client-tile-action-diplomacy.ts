import type { ClientState } from "../client-state/client-state.js";
import type { ActiveTruceView, TileActionDef } from "../client-types.js";
import { allyStatusLabel, fealtyLookupFor, type FealtyState } from "../client-fealty/client-fealty.js";

type DiplomacyActionState = Pick<
  ClientState,
  "allies" | "incomingAllianceRequests" | "outgoingAllianceRequests" | "incomingTruceRequests" | "outgoingTruceRequests"
> & Partial<Pick<ClientState, "me">> & { leaderboard?: FealtyState["leaderboard"] };

type DiplomacyActionDeps = {
  activeTruceWithPlayer: (playerId?: string | null) => ActiveTruceView | undefined;
};

// "Your liege" / "Sworn to you" for an unequal alliance (client-fealty.ts), else "Allied".
const allyDetail = (state: DiplomacyActionState, ownerId: string): string => {
  const standing = fealtyLookupFor({ me: state.me ?? "", leaderboard: state.leaderboard })(ownerId);
  return standing === "ALLIANCE" ? "Allied" : allyStatusLabel(standing);
};

/**
 * The single diplomacy entry on another player's tile. It replaces the old
 * "Offer Truce 12h/24h" rows: the Diplomacy deal owns proposing, so this just
 * says where you stand with the tile's owner and opens that player's deal. A
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
      ? allyDetail(state, ownerId)
      : deps.activeTruceWithPlayer(ownerId)
        ? "Truce active"
        : sentByYou
          ? "Your request is pending"
          : "Propose an alliance or truce";
  return { id: "diplomacy", label: "Diplomacy", detail, ...(awaitingYou ? { recommended: true } : {}) };
};

/**
 * Asks the v2 HUD to open the Diplomacy deal with this player (client-hud-v2.ts
 * frame consumes and clears the request). The caller re-renders.
 */
export const openDiplomacyForPlayer = (state: Pick<ClientState, "requestedDiplomacyTargetId">, playerId: string): void => {
  state.requestedDiplomacyTargetId = playerId;
};

/**
 * The pending Diplomacy request, cleared so it opens once. Dropped while the game is not on screen
 * (sign-in, lobby, reconnect): a tap made just before then must not pop the deal open later.
 */
export const takeRequestedDiplomacyTarget = (state: Pick<ClientState, "requestedDiplomacyTargetId">, gameShown = true): string | undefined => {
  const targetId = state.requestedDiplomacyTargetId;
  state.requestedDiplomacyTargetId = undefined;
  return gameShown ? targetId : undefined;
};
