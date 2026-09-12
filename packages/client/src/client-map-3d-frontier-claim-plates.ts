import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Mesh, MeshBasicMaterial } from "three";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import { FRONTIER_OPACITY } from "./client-map-3d-ownership-overlay.js";
import type { ClientState } from "./client-state/client-state.js";

const TILE_CENTER_OFFSET = 0.5;

// First-observed timestamp per ADVANCE/MARCH auto-fired EXPAND's (or, as of
// the FRONTIER-attack instant-capture change below, ATTACK-on-FRONTIER's)
// claim phase (keyed by target tile key), for the same reason
// advanceTransitSeenAt (client-map-3d-capture-overlays.ts) tracks the travel
// phase: the server tells us only resolvesAt (and, separately, transitEndsAt
// for the travel leg), never when the claim itself actually started, so a
// claim that already has transitEndsAt in the past uses that as its
// authoritative start; only a claim this client observes mid-flight with no
// transit leg at all (transitEndsAt never set) falls back to "the first
// frame this client saw it".
const advanceClaimSeenAt = new Map<string, number>();

// Drives the frontier-claim plate pool from every currently-claiming EXPAND,
// plus every currently-resolving ATTACK on a tile this client already knows
// is undefended FRONTIER ground: this client's own manually-dispatched claim
// (the single state.capture slot) plus any number of this player's muster
// flags auto-firing an EXPAND or FRONTIER-targeted ATTACK via ADVANCE/MARCH
// (state.outgoingMusterAttacksByTile -- populated by
// handleMusterAdvanceExpandAccepted/handleMusterAdvanceCombatStart in
// client-siege-tracking.ts, the same source syncMusterTransitOverlay/
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
export function syncFrontierClaimPlates(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  heightfield: Heightfield,
  plates: readonly Mesh[],
  originX: number,
  originY: number,
  markerRise: number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): void {
  const nowEpochMs = Date.now();
  type ClaimEntry = { targetX: number; targetY: number; startAt: number; resolvesAt: number };
  const claims: ClaimEntry[] = [];
  const coveredTargetKeys = new Set<string>();

  const isKnownFrontierAttack = (targetX: number, targetY: number): boolean =>
    state.tiles.get(keyFor(targetX, targetY))?.ownershipState === "FRONTIER";

  // This client's own claim first -- authoritative startAt from the moment
  // it was actually dispatched, and takes priority over a muster entry that
  // happens to share the same target tile.
  const capture = state.capture;
  if (
    capture &&
    !capture.fromMusterAdvance &&
    capture.resolvesAt > nowEpochMs &&
    (capture.actionType === "EXPAND" || (capture.actionType === "ATTACK" && isKnownFrontierAttack(capture.target.x, capture.target.y)))
  ) {
    const key = keyFor(capture.target.x, capture.target.y);
    claims.push({ targetX: capture.target.x, targetY: capture.target.y, startAt: capture.startAt, resolvesAt: capture.resolvesAt });
    coveredTargetKeys.add(key);
  }

  const liveClaimKeys = new Set<string>();
  for (const [key, outgoing] of state.outgoingMusterAttacksByTile) {
    if (outgoing.resolvesAt <= nowEpochMs || coveredTargetKeys.has(key)) continue;
    if (!outgoing.isExpand && !isKnownFrontierAttack(outgoing.targetX, outgoing.targetY)) continue;
    // While the flag's company is still marching, the transit overlay shows
    // that leg, not this one -- same phase split syncBattleOverlayFx's
    // skirmish loop uses for an auto-fired ATTACK.
    if (outgoing.transitEndsAt !== undefined && outgoing.transitEndsAt > nowEpochMs) continue;
    liveClaimKeys.add(key);
    const startAt = outgoing.transitEndsAt ?? advanceClaimSeenAt.get(key) ?? nowEpochMs;
    if (!advanceClaimSeenAt.has(key)) advanceClaimSeenAt.set(key, startAt);
    claims.push({ targetX: outgoing.targetX, targetY: outgoing.targetY, startAt, resolvesAt: outgoing.resolvesAt });
  }
  for (const key of advanceClaimSeenAt.keys()) {
    if (!liveClaimKeys.has(key)) advanceClaimSeenAt.delete(key);
  }

  const empireColor = state.playerColors.get(state.me) ?? "#7dd3fc";
  const TILE_WIDTH = 0.94;
  const HALF_TILE = TILE_WIDTH * 0.5;
  let i = 0;
  for (const claim of claims) {
    const plate = plates[i];
    if (!plate) break;
    i += 1;
    const material = plate.material as MeshBasicMaterial;
    material.color.set(empireColor);
    material.opacity = FRONTIER_OPACITY;
    const total = Math.max(1, claim.resolvesAt - claim.startAt);
    const elapsed = nowEpochMs - claim.startAt;
    const t = Math.max(0, Math.min(1, elapsed / total));
    const dxw = toroidDelta(originX, claim.targetX, WORLD_WIDTH);
    const dyw = toroidDelta(originY, claim.targetY, WORLD_HEIGHT);
    const wxNext = wrapX(claim.targetX + 1);
    const wyNext = wrapY(claim.targetY + 1);
    const surfaceY =
      (heightfield.cornerYAt(claim.targetX, claim.targetY) +
        heightfield.cornerYAt(wxNext, claim.targetY) +
        heightfield.cornerYAt(claim.targetX, wyNext) +
        heightfield.cornerYAt(wxNext, wyNext)) /
      4;
    // Anchor the plate's LEFT edge at tile-center − HALF_TILE; scaling X by
    // t grows the plate rightward from there — same sweep-in-from-the-left
    // presentation the single-plate version used.
    const tileCenterX = dxw + TILE_CENTER_OFFSET;
    const tileCenterZ = dyw + TILE_CENTER_OFFSET;
    const leftEdgeX = tileCenterX - HALF_TILE;
    plate.scale.set(Math.max(0.001, t), 1, 1);
    plate.position.set(leftEdgeX + (TILE_WIDTH * t) * 0.5, surfaceY + markerRise, tileCenterZ);
    plate.visible = true;
  }
  for (; i < plates.length; i += 1) {
    const plate = plates[i];
    if (plate) plate.visible = false;
  }
}
