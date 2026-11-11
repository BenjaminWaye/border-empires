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
import { activeTransitLeg, clientMusterTransitRoute, isStraightRoute, marchStartAt, sailPath } from "./client-muster-transit-route/client-muster-transit-route.js";

// Split out of client-map-3d-capture-overlays.ts (500-line cap) when march
// companies started showing their empire's weapons-factory gear.

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

// Drives the marching-company overlay from state.musterTransitByCommand/
// deferredAttackByCommand (client-muster-transit.ts) — this client's own
// muster-funded attacks still in their local pre-send march (see
// armMusterTransit in client-queue-logic.ts). Runs every frame since the
// company's position needs to advance continuously. Only ever covers the
// local player's own outgoing marches — armMusterTransit is purely local
// bookkeeping before the ATTACK is even sent, so there's nothing to show an
// observer until the attack actually fires and the normal
// incomingAttacksByTile/activeBattles machinery above takes over (which is
// also, not coincidentally, exactly when this overlay should stop: an entry
// leaves state.deferredAttackByCommand the instant it's actually sent).
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
  // This client's own marches wear its own factories' gear; resolved lazily
  // since most frames have no march at all.
  let ownGear: SquadGear | undefined | null = null;
  const myGear = (): SquadGear | undefined => {
    if (ownGear === null) ownGear = localPlayerSquadGear(state);
    return ownGear;
  };

  // Builds and adds one company's march, from (musterX,musterY) to
  // (marchToX,marchToY) — the firing tile the transit's duration is
  // actually budgeted for, NOT necessarily the real attack target (a
  // remotely-funded attack's flag only marches to the front; the
  // adjacency-only "hop" from there onto the target is the ATTACK itself,
  // not additional travel — see MusterTransitEntry's marchToX comment).
  const addMarch = (
    musterX: number, musterY: number, marchToX: number, marchToY: number, startAt: number, arriveAt: number, standUntil?: number, color: string = ownerColor,
    gear: SquadGear | undefined = myGear()
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
      ...(gear ? { gear } : {})
    });
  };

  // Scene-space path through tile points, unwrapped one step at a time so a
  // route over the world seam stays continuous.
  const scenePath = (points: ReadonlyArray<{ x: number; y: number }>): Array<{ x: number; z: number }> => {
    let prev = points[0]!;
    let x = toroidDelta(originX, prev.x, WORLD_WIDTH);
    let z = toroidDelta(originY, prev.y, WORLD_HEIGHT);
    const out = [{ x: x + TILE_CENTER_OFFSET, z: z + TILE_CENTER_OFFSET }];
    for (const point of points.slice(1)) {
      x += toroidDelta(prev.x, point.x, WORLD_WIDTH);
      z += toroidDelta(prev.y, point.y, WORLD_HEIGHT);
      out.push({ x: x + TILE_CENTER_OFFSET, z: z + TILE_CENTER_OFFSET });
      prev = point;
    }
    return out;
  };

  // A company's march from its flag to the tile it launches from, along the
  // real route (client-muster-transit-route.ts): over land, and where the
  // straight walk would cross water, to a dock, across in a troop transport
  // and out again. Only the leg under way is drawn; the troops are aboard
  // (not drawn) while the boat sails.
  // `firstSeenAt` (server-fired marches, whose start the client isn't told):
  // the real start is derived from the route instead (marchStartAt).
  const addRoutedMarch = (musterX: number, musterY: number, marchToX: number, marchToY: number, startAt: number, arriveAt: number, firstSeenAt?: number): void => {
    const route = clientMusterTransitRoute(state, { x: musterX, y: musterY }, { x: marchToX, y: marchToY });
    if (firstSeenAt !== undefined) startAt = marchStartAt(route, arriveAt, firstSeenAt);
    const leg = activeTransitLeg(route, startAt, arriveAt, nowEpochMs);
    if (!leg) return;
    if (leg.kind === "SAIL") {
      transitOverlay.addVoyage({ path: scenePath(sailPath(state, leg.from, leg.to)), startAt: leg.startAt, arriveAt: leg.endAt, ownerColor });
      return;
    }
    if (isStraightRoute(route, { x: musterX, y: musterY }, { x: marchToX, y: marchToY })) {
      addMarch(musterX, musterY, marchToX, marchToY, startAt, arriveAt);
      return;
    }
    const first = leg.points[0]!;
    const last = leg.points[leg.points.length - 1]!;
    const firstY = Math.max(heightfield.elevationAt(first.x, first.y), heightfield.cornerYAt(first.x, first.y));
    const lastY = Math.max(heightfield.elevationAt(last.x, last.y), heightfield.cornerYAt(last.x, last.y));
    const gear = myGear();
    transitOverlay.addTransit({
      path: scenePath(leg.points),
      groundY: (firstY + lastY) / 2,
      startAt: leg.startAt,
      arriveAt: leg.endAt,
      ownerColor,
      ...(gear ? { gear } : {})
    });
  };

  for (const [attackKey, transit] of state.musterTransitByCommand) {
    // Only still-marching entries — once fired (no deferred entry left) or
    // expired, the skirmish/battle overlay is the right visualization, not
    // this one.
    if (!state.deferredAttackByCommand.has(attackKey) || nowEpochMs >= transit.transitEndsAt) continue;
    addRoutedMarch(transit.musterX, transit.musterY, transit.marchToX, transit.marchToY, transit.transitStartAt, transit.transitEndsAt);
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
    addRoutedMarch(outgoing.musterOriginX, outgoing.musterOriginY, outgoing.originX, outgoing.originY, startAt, outgoing.transitEndsAt, startAt);
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
    addMarch(incoming.fromX, incoming.fromY, incoming.targetX, incoming.targetY, incoming.startAt, incoming.startAt + CLAIM_STEP_IN_MS, incoming.resolvesAt, effectiveOverlayColor(incoming.attackerId), knownSquadGearFor(state, incoming.attackerId));
  }

  transitOverlay.commit();
  transitOverlay.tick(nowEpochMs);
}
