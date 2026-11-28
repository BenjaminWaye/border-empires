// Guide inputs for the Contest and Diplomacy chapters: who the player can
// attack from their border, whether they have an attack under way, and how
// far their first truce has got. Read fresh on every guide render; the tile
// scan that finds the attack candidates is cached with the rest
// (tutorial-guide-input.ts).

import type { ClientState } from "../client-state/client-state.js";
import type { FealtyLookup, FealtyStanding } from "../client-fealty/client-fealty.js";

export type GuideTruceStage = "none" | "offered" | "incoming" | "active";

export type GuideContestState = Pick<
  ClientState,
  | "allies"
  | "activeTruces"
  | "incomingTruceRequests"
  | "outgoingTruceRequests"
  | "pendingMusterAttacks"
  | "detachedAttacksByCommandId"
  | "outgoingMusterAttacksByTile"
  | "capture"
  | "actionCurrent"
>;

/** Another owner's tile touching the player's land, with its owner. */
export type GuideAttackCandidate = { x: number; y: number; ownerId: string };

const MAX_ATTACK_TARGETS = 6;

/**
 * An attack the player ordered is under way: parked on a flag while it fills,
 * in flight, or locked and resolving. The step's completion is sticky, so the
 * few seconds a fight lasts is plenty for the guide to see it.
 */
export const guideAttackLaunched = (state: GuideContestState): boolean =>
  state.pendingMusterAttacks.length > 0 ||
  state.detachedAttacksByCommandId.size > 0 ||
  state.capture?.actionType === "ATTACK" ||
  state.actionCurrent?.actionType === "ATTACK" ||
  [...state.outgoingMusterAttacksByTile.values()].some((attack) => !attack.isExpand);

/** Border tiles the player can attack: not an ally's, not a truce partner's. Nearest home first. */
export const guideAttackTargets = (
  candidates: ReadonlyArray<GuideAttackCandidate>,
  state: Pick<GuideContestState, "allies" | "activeTruces">,
  distance: (tile: { x: number; y: number }) => number
): Array<{ x: number; y: number }> => {
  const friendly = new Set([...state.allies, ...state.activeTruces.map((truce) => truce.otherPlayerId)]);
  return candidates
    .filter((tile) => !friendly.has(tile.ownerId))
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, MAX_ATTACK_TARGETS)
    .map(({ x, y }) => ({ x, y }));
};

/** How far the first truce has got: a truce in force, a rival's offer waiting, the player's own offer waiting, or nothing yet. */
export const guideTruceStage = (state: Pick<GuideContestState, "activeTruces" | "incomingTruceRequests" | "outgoingTruceRequests">): GuideTruceStage => {
  if (state.activeTruces.length > 0) return "active";
  if (state.incomingTruceRequests.length > 0) return "incoming";
  if (state.outgoingTruceRequests.length > 0) return "offered";
  return "none";
};

/**
 * Your alliance wording with the met rival Houses (client-fealty.ts): SWEAR as soon as one of them is at least
 * twice your size, since that is the case new players misread (owner, 2026-11-28), else the first one's.
 */
export const guideAllianceStanding = (metPlayerIds: Iterable<string>, standingWith: FealtyLookup): FealtyStanding => {
  let first: FealtyStanding | undefined;
  for (const id of metPlayerIds) {
    const standing = standingWith(id);
    if (standing === "SWEAR") return standing;
    first ??= standing;
  }
  return first ?? "ALLIANCE";
};

/** An alliance is offered or in force, or a deal screen has its alliance option picked (its pressed treaty button). */
export const guideAllianceSeen = (state: Pick<ClientState, "allies" | "outgoingAllianceRequests" | "incomingAllianceRequests">, root: Pick<Document, "querySelector"> | undefined): boolean =>
  state.allies.length > 0 ||
  state.outgoingAllianceRequests.length > 0 ||
  state.incomingAllianceRequests.length > 0 ||
  Boolean(root?.querySelector('[data-trade-kind^="alliance"][aria-pressed="true"]'));
