import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import { CLASH_MS } from "./client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import { knownSquadGearFor, localPlayerSquadGear } from "./client-battle-overlay/client-battle-overlay.js";
import type { SquadGear } from "./client-map-3d-popup-marine/popup-marine-gear.js";
import { isDockCrossingBetween } from "./client-muster-attack-gate/client-muster-attack-gate.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import { tileWalkPath, type MusterTransitOverlay } from "./client-map-3d-muster-transit-overlay.js";
import { activeFrontierAttackClaimTargetKeys } from "./client-map-3d-frontier-claim-plates.js";
import type { ClientState } from "./client-state/client-state.js";
import { activeIncomingFrontierClaims } from "./client-incoming-frontier-claim/client-incoming-frontier-claim.js";
import { TILE_CENTER_OFFSET } from "./client-map-3d-capture-overlays.js";

// Split out of client-map-3d-capture-overlays.ts (500-line cap) when march
// companies started fielding their empire's weapons-factory specialists.

// Short walk from the firing tile onto the claimed tile before the company
// settles into its at-ease stance for the rest of the claim timer.
const CLAIM_STEP_IN_MS = 700;

// A shield's reinforcement company dashes in fast, well inside CLASH_MS,
// rather than taking the whole clash+rout window to arrive -- it fought
// this battle, so it needs to already be there once the firefight is
// underway, not turn up only as the dust settles.
const SHIELD_REINFORCEMENT_MARCH_MS = Math.round(CLASH_MS * 0.4);

// First-observed timestamp per ADVANCE/MARCH auto-fire transit (keyed by
// target tile key), since the server tells us only transitEndsAt, not when
// the march actually started — mirrors skirmishSeenAt's own pattern for the
// same reason (this client never armed the transit itself the way it does
// for a manual attack, so there's no local startAt to read).
const advanceTransitSeenAt = new Map<string, number>();

// Drives the marching-company overlay from state.musterTransitByTile/
// deferredAttackByTile (client-muster-transit.ts) — this client's own
// muster-funded attacks still in their local pre-send march (see
// armMusterTransit in client-queue-logic.ts). Runs every frame (not just on
// terrain rebuild, unlike syncCaptureOverlays' supply lines above) since the
// company's position needs to advance continuously. Only ever covers the
// local player's own outgoing marches — armMusterTransit is purely local
// bookkeeping before the ATTACK is even sent, so there's nothing to show an
// observer until the attack actually fires and the normal
// incomingAttacksByTile/activeBattles machinery above takes over (which is
// also, not coincidentally, exactly when this overlay should stop: an entry
// leaves state.deferredAttackByTile the instant it's actually sent).
export function syncMusterTransitOverlay(
  state: ClientState,
  effectiveOverlayColor: (ownerId: string) => string,
  heightfield: Heightfield,
  transitOverlay: MusterTransitOverlay,
  originX: number,
  originY: number,
  keyFor: (x: number, y: number) => string
): void {
  const nowEpochMs = Date.now();
  transitOverlay.clear();
  const ownerColor = effectiveOverlayColor(state.me ?? "");
  // This client's own war industry, read off its own tiles -- only on a
  // frame that actually has one of its own companies marching.
  let ownGear: SquadGear | undefined;
  const myGear = (): SquadGear => (ownGear ??= localPlayerSquadGear(state));

  // Builds and adds one company's march, from (musterX,musterY) to
  // (marchToX,marchToY) — the firing tile the transit's duration is
  // actually budgeted for, NOT necessarily the real attack target (a
  // remotely-funded attack's flag only marches to the front; the
  // adjacency-only "hop" from there onto the target is the ATTACK itself,
  // not additional travel — see MusterTransitEntry's marchToX comment).
  const addMarch = (
    musterX: number, musterY: number, marchToX: number, marchToY: number, startAt: number, arriveAt: number, standUntil?: number, color: string = ownerColor,
    gear: SquadGear = myGear()
  ): void => {
    const srcDx = toroidDelta(originX, musterX, WORLD_WIDTH);
    const srcDy = toroidDelta(originY, musterY, WORLD_HEIGHT);
    const tgtDx = toroidDelta(originX, marchToX, WORLD_WIDTH);
    const tgtDy = toroidDelta(originY, marchToY, WORLD_HEIGHT);
    // A dock crossing has no meaningful tile-by-tile route across open
    // water (matches the fixed-hop treatment findClosestMuster/
    // hasFundedMusterWithinRange already give it) — walk the real grid for
    // every other march.
    const isDock = isDockCrossingBetween(state, musterX, musterY, marchToX, marchToY);
    const rawPath = isDock
      ? [{ x: srcDx, z: srcDy }, { x: tgtDx, z: tgtDy }]
      : tileWalkPath(srcDx, srcDy, tgtDx, tgtDy);
    const srcSurfaceY = Math.max(heightfield.elevationAt(musterX, musterY), heightfield.cornerYAt(musterX, musterY));
    const tgtSurfaceY = Math.max(heightfield.elevationAt(marchToX, marchToY), heightfield.cornerYAt(marchToX, marchToY));
    transitOverlay.addTransit({
      path: rawPath.map((p) => ({ x: p.x + TILE_CENTER_OFFSET, z: p.z + TILE_CENTER_OFFSET })),
      groundY: (srcSurfaceY + tgtSurfaceY) / 2,
      startAt,
      arriveAt,
      ...(standUntil !== undefined ? { standUntil } : {}),
      ownerColor: color,
      gear,
      // The flag tile's seed: the same company every frame of its march.
      hashSeed: musterX * 92821 + musterY
    });
  };

  for (const [flagKey, transit] of state.musterTransitByTile) {
    // Only still-marching entries — once fired (no deferred entry left) or
    // expired, the skirmish/battle overlay is the right visualization, not
    // this one.
    if (!state.deferredAttackByTile.has(flagKey) || nowEpochMs >= transit.transitEndsAt) continue;
    addMarch(transit.musterX, transit.musterY, transit.marchToX, transit.marchToY, transit.transitStartAt, transit.transitEndsAt);
  }

  // ADVANCE/MARCH auto-fire's own mechanical travel-time delay (see
  // runtime-frontier-command.ts) — server-dispatched, so there's no local
  // armMusterTransit call to read a startAt from; approximate it as "the
  // first frame this client observed the transit" instead.
  const liveAdvanceKeys = new Set<string>();
  for (const [targetKey, outgoing] of state.outgoingMusterAttacksByTile) {
    if (outgoing.transitEndsAt === undefined || outgoing.musterOriginX === undefined || outgoing.musterOriginY === undefined) continue;
    if (nowEpochMs >= outgoing.transitEndsAt) continue;
    liveAdvanceKeys.add(targetKey);
    let startAt = advanceTransitSeenAt.get(targetKey);
    if (startAt === undefined) {
      startAt = nowEpochMs;
      advanceTransitSeenAt.set(targetKey, startAt);
    }
    addMarch(outgoing.musterOriginX, outgoing.musterOriginY, outgoing.originX, outgoing.originY, startAt, outgoing.transitEndsAt);
  }
  for (const key of advanceTransitSeenAt.keys()) {
    if (!liveAdvanceKeys.has(key)) advanceTransitSeenAt.delete(key);
  }

  // Reactive shield reveal (docs/replenishment-update-plan.md workstream E):
  // a resolved battle whose defender was shielded carries the shield tile's
  // coordinates (client-battle-overlay.ts's ActiveBattleOverlay.shieldX/Y).
  // March that flag's company from the shield tile to the fight, in the
  // defender's colour, arriving quickly as the clash begins (not at the
  // very end -- the reinforcement helped fight this battle, it didn't show
  // up after it was over), then stands at ease for the rest of the clash
  // and rout until the whole battle overlay expires and gets pruned, same
  // as this loop's own next tick simply stops finding it in
  // state.activeBattles. battle.startAt/clashAt are both already stamped at
  // or before "now" at registration (a resolved battle never replays an
  // approach -- see registerActiveBattleFromTileDelta's own comment), so
  // clashAt is the earliest instant with any real elapsed time still ahead
  // of it to actually animate a march across.
  for (const battle of state.activeBattles.values()) {
    if (battle.shieldX === undefined || battle.shieldY === undefined) continue;
    addMarch(
      battle.shieldX, battle.shieldY, battle.targetX, battle.targetY,
      battle.clashAt, battle.clashAt + SHIELD_REINFORCEMENT_MARCH_MS, battle.endAt,
      effectiveOverlayColor(battle.defenderOwnerId),
      battle.defenderGear ?? knownSquadGearFor(state, battle.defenderOwnerId)
    );
  }

  // Claim phase of an auto-fired EXPAND / FRONTIER-targeted ATTACK: the
  // company steps from the firing tile onto the target and stands at ease
  // there until the claim plate (client-map-3d-frontier-claim-plates.ts)
  // finishes, instead of vanishing when the travel leg ends.
  const claimKeys = activeFrontierAttackClaimTargetKeys(state, keyFor, nowEpochMs);
  for (const [targetKey, outgoing] of state.outgoingMusterAttacksByTile) {
    if (outgoing.transitEndsAt === undefined || outgoing.transitEndsAt > nowEpochMs) continue;
    if (outgoing.resolvesAt <= nowEpochMs) continue;
    if (!outgoing.isExpand && !claimKeys.has(targetKey)) continue;
    addMarch(outgoing.originX, outgoing.originY, outgoing.targetX, outgoing.targetY, outgoing.transitEndsAt, outgoing.transitEndsAt + CLAIM_STEP_IN_MS, outgoing.resolvesAt);
  }
  // Same claim-phase step-in for this client's own manually-dispatched ATTACK
  // on a known-FRONTIER tile (the single state.capture slot, which never
  // reaches outgoingMusterAttacksByTile above). The skirmish FX skips these
  // targets, so without this the plate sweep ran with no soldiers at all.
  const manualClaim = state.capture;
  if (
    manualClaim?.actionType === "ATTACK" &&
    manualClaim.origin &&
    !manualClaim.fromMusterAdvance &&
    manualClaim.resolvesAt > nowEpochMs &&
    claimKeys.has(keyFor(manualClaim.target.x, manualClaim.target.y))
  ) {
    addMarch(manualClaim.origin.x, manualClaim.origin.y, manualClaim.target.x, manualClaim.target.y, manualClaim.startAt, manualClaim.startAt + CLAIM_STEP_IN_MS, manualClaim.resolvesAt);
  }
  // Defending side of the same capture: the attacker's company steps onto
  // this player's FRONTIER tile, in the attacker's colour, and holds it until
  // the claim resolves -- the skirmish FX deliberately skips these tiles.
  for (const incoming of activeIncomingFrontierClaims(state, nowEpochMs)) {
    if (incoming.fromX === undefined || incoming.fromY === undefined || !incoming.attackerId) continue;
    addMarch(incoming.fromX, incoming.fromY, incoming.targetX, incoming.targetY, incoming.startAt, incoming.startAt + CLAIM_STEP_IN_MS, incoming.resolvesAt, effectiveOverlayColor(incoming.attackerId));
  }

  transitOverlay.commit();
  transitOverlay.tick(nowEpochMs);
}
