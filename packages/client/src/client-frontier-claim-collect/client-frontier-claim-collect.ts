import { activeIncomingFrontierClaims } from "../client-incoming-frontier-claim/client-incoming-frontier-claim.js";
import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import type { ClientState } from "../client-state/client-state.js";
import { frontierAttackIsUndefended } from "../client-capture-hold/client-capture-hold.js";
import {
  EXPAND_CREW_MANUAL,
  EXPAND_CREW_MUSTER,
  expandCrewFromStep,
  type ExpandCrewClaim
} from "../client-expand-crew/client-expand-crew.js";

// Every frontier claim currently filling in, for both renderers: the 3D
// claim plates and expand crew (client-map-3d-frontier-claim-plates.ts) and
// the 2D canvas crew (client-expand-crew-2d/). Moved out of the 3D plate file
// so the 2D path can share it without importing three.

// First-observed timestamp per ADVANCE/MARCH auto-fired EXPAND's (or, as of
// the FRONTIER-attack instant-capture change below, ATTACK-on-FRONTIER's)
// claim phase (keyed by target tile key), for the same reason
// advanceTransitSeenAt (client-map-3d-capture-overlays.ts) tracks the travel
// phase: the server tells us only resolvesAt (and, separately, transitEndsAt
// for the travel leg), never when the claim itself actually started, so a
// claim that already has transitEndsAt in the past uses that as its
// authoritative start; only a claim this client observes mid-flight with no
// transit leg at all (transitEndsAt never set) falls back to "the first
// frame this client saw it". Bounded: pruned every collect to the live
// muster claims, which the plate pool / flag cap keep small.
const advanceClaimSeenAt = new Map<string, number>();

type ClaimSourceState = Pick<ClientState, "capture" | "outgoingMusterAttacksByTile" | "tiles" | "incomingAttacksByTile" | "me" | "playerColors">;

// Target tile keys of every ATTACK this client currently knows is resolving
// against undefended FRONTIER ground (this client's own claim plus muster
// auto-fire) -- i.e. exactly the ATTACK-side half of the plate eligibility
// below, shared out so the base ownership tint (client-map-3d.ts) can hide
// the target's still-there enemy-color frontier fill while this plate
// sweeps in on top of it. Without this, an ATTACK on an enemy's FRONTIER
// tile shows the "becoming mine" sweep over ground that never visually goes
// neutral first, unlike a real EXPAND target, which has no owner tint to
// begin with. EXPAND targets are deliberately excluded: they're already
// unowned, so there's no enemy tint to hide. Also covers an enemy's ATTACK on
// this player's own FRONTIER tile (activeIncomingFrontierClaims): the
// defender's own frontier fill hides the same way, so the tile visibly goes
// neutral while the attacker's colour sweeps in.
export function activeFrontierAttackClaimTargetKeys(
  state: Pick<ClientState, "capture" | "outgoingMusterAttacksByTile" | "tiles" | "incomingAttacksByTile" | "me">,
  keyFor: (x: number, y: number) => string,
  nowEpochMs: number
): Set<string> {
  // Undefended FRONTIER only: a freshly captured tile still holding ground
  // (capture-hold) is a real fight and gets the skirmish/battle FX instead.
  const isKnownFrontierAttack = (targetX: number, targetY: number, lockedWinChance: number | undefined): boolean =>
    frontierAttackIsUndefended(state.tiles.get(keyFor(targetX, targetY)), lockedWinChance, nowEpochMs);
  const keys = new Set<string>();

  const capture = state.capture;
  if (
    capture &&
    !capture.fromMusterAdvance &&
    capture.resolvesAt > nowEpochMs &&
    capture.actionType === "ATTACK" &&
    isKnownFrontierAttack(capture.target.x, capture.target.y, capture.combatSnapshot?.winChance)
  ) {
    keys.add(keyFor(capture.target.x, capture.target.y));
  }

  for (const [key, outgoing] of state.outgoingMusterAttacksByTile) {
    if (outgoing.isExpand || outgoing.resolvesAt <= nowEpochMs) continue;
    // Still marching: the transit overlay owns the tint during this leg.
    if (outgoing.transitEndsAt !== undefined && outgoing.transitEndsAt > nowEpochMs) continue;
    if (!isKnownFrontierAttack(outgoing.targetX, outgoing.targetY, outgoing.winChance)) continue;
    keys.add(key);
  }

  for (const claim of activeIncomingFrontierClaims(state, nowEpochMs)) keys.add(claim.key);

  return keys;
}

// A claim plus its expand crew (crew 0 for an ATTACK on frontier ground,
// which keeps the plain plate sweep: only EXPANDs send ancillaries out).
export type FrontierClaim = ExpandCrewClaim & { readonly color: string };

// Every currently-claiming EXPAND, plus every currently-resolving ATTACK on a
// tile this client already knows is undefended FRONTIER ground: this
// client's own manually-dispatched claim (the single state.capture slot)
// plus any number of this player's muster flags auto-firing an EXPAND or
// FRONTIER-targeted ATTACK via ADVANCE/MARCH (state.outgoingMusterAttacksByTile
// -- populated by handleMusterAdvanceExpandAccepted/handleMusterAdvanceCombatStart
// in client-siege-tracking.ts, the same source syncMusterTransitOverlay/
// syncBattleOverlayFx in client-map-3d-capture-overlays.ts already read for
// the travel and skirmish legs of the very same auto-fired action).
//
// An ATTACK on FRONTIER ground has no defending force (see
// runtime-lock-resolution.ts's hasDefendingForce) -- the simulation resolves
// it as a guaranteed capture with no combat roll or combat broadcast, so it
// gets this same "becoming mine" plate sweep instead of the skirmish/clash
// overlay a real fight would use. A target this client hasn't seen tile data
// for yet is left to the skirmish path's own fallback (see
// client-map-3d-capture-overlays.ts) since only the server knows for certain
// whether it's undefended.
export function collectFrontierClaims(
  state: ClaimSourceState,
  keyFor: (x: number, y: number) => string,
  nowEpochMs: number
): FrontierClaim[] {
  const empireColor = state.playerColors.get(state.me) ?? "#7dd3fc";
  const claims: FrontierClaim[] = [];
  const coveredTargetKeys = new Set<string>();
  const activeFrontierAttackKeys = activeFrontierAttackClaimTargetKeys(state, keyFor, nowEpochMs);
  const isMineAt = (x: number, y: number): boolean => state.tiles.get(keyFor(x, y))?.ownerId === state.me;

  // This client's own claim first -- authoritative startAt from the moment
  // it was actually dispatched, and takes priority over a muster entry that
  // happens to share the same target tile.
  const capture = state.capture;
  if (
    capture &&
    !capture.fromMusterAdvance &&
    capture.resolvesAt > nowEpochMs &&
    (capture.actionType === "EXPAND" || activeFrontierAttackKeys.has(keyFor(capture.target.x, capture.target.y)))
  ) {
    const isExpand = capture.actionType === "EXPAND";
    const fromStep = isExpand ? expandCrewFromStep(capture.target, capture.origin, isMineAt) : undefined;
    claims.push({
      targetX: capture.target.x,
      targetY: capture.target.y,
      startAt: capture.startAt,
      resolvesAt: capture.resolvesAt,
      color: empireColor,
      crew: isExpand ? EXPAND_CREW_MANUAL : 0,
      ...(fromStep ? { fromStep } : {})
    });
    coveredTargetKeys.add(keyFor(capture.target.x, capture.target.y));
  }

  const liveClaimKeys = new Set<string>();
  for (const [key, outgoing] of state.outgoingMusterAttacksByTile) {
    if (outgoing.resolvesAt <= nowEpochMs || coveredTargetKeys.has(key)) continue;
    if (!outgoing.isExpand && !activeFrontierAttackKeys.has(key)) continue;
    // While the flag's company is still marching, the transit overlay shows
    // that leg, not this one -- same phase split syncBattleOverlayFx's
    // skirmish loop uses for an auto-fired ATTACK.
    if (outgoing.transitEndsAt !== undefined && outgoing.transitEndsAt > nowEpochMs) continue;
    liveClaimKeys.add(key);
    const startAt = outgoing.transitEndsAt ?? advanceClaimSeenAt.get(key) ?? nowEpochMs;
    if (!advanceClaimSeenAt.has(key)) advanceClaimSeenAt.set(key, startAt);
    const isExpand = outgoing.isExpand === true;
    const fromStep = isExpand
      ? expandCrewFromStep({ x: outgoing.targetX, y: outgoing.targetY }, { x: outgoing.originX, y: outgoing.originY }, isMineAt)
      : undefined;
    claims.push({
      targetX: outgoing.targetX,
      targetY: outgoing.targetY,
      startAt,
      resolvesAt: outgoing.resolvesAt,
      color: empireColor,
      crew: isExpand ? EXPAND_CREW_MUSTER : 0,
      ...(fromStep ? { fromStep } : {})
    });
  }
  // An enemy taking this player's own FRONTIER tile: same sweep, in the
  // attacker's colour (the key set above already hid this player's tint).
  for (const incoming of activeIncomingFrontierClaims(state, nowEpochMs)) {
    if (coveredTargetKeys.has(incoming.key)) continue;
    const color = incoming.attackerId ? resolveOwnerColor(incoming.attackerId, state.playerColors, fallbackOwnerColor) : "#8a8f98";
    claims.push({ targetX: incoming.targetX, targetY: incoming.targetY, startAt: incoming.startAt, resolvesAt: incoming.resolvesAt, color, crew: 0 });
  }
  for (const key of advanceClaimSeenAt.keys()) {
    if (!liveClaimKeys.has(key)) advanceClaimSeenAt.delete(key);
  }
  return claims;
}
