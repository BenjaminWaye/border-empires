import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Mesh, MeshBasicMaterial } from "three";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { BattleOverlayFx, BattleOverlayRenderEntry, BattleOverlaySkirmishEntry } from "./client-map-3d-popup-marine/popup-marine-overlay-fx.js";
import { pruneExpiredActiveBattles } from "./client-battle-overlay/client-battle-overlay.js";
import { pruneExpiredIncomingAttacks, pruneExpiredOutgoingMusterAttacks } from "./client-siege-tracking/client-siege-tracking.js";
import {
  activeMusterSupplyLines,
  outgoingMusterAttackTransitLines,
  resolveAdvanceMusterFallbackSource,
  type AdvanceMusterFallbackCache
} from "./client-muster-transit/client-muster-transit.js";
import { isDockCrossingBetween } from "./client-muster-attack-gate/client-muster-attack-gate.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import { FRONTIER_OPACITY } from "./client-map-3d-ownership-overlay.js";
import type { SupplyLineOverlay } from "./client-map-3d-supply-line-overlay.js";
import { tileWalkPath, type MusterTransitOverlay } from "./client-map-3d-muster-transit-overlay.js";
import type { ClientState } from "./client-state/client-state.js";

const TILE_CENTER_OFFSET = 0.5;

// Placeholder passed to playerColorFor for the attacker's own skirmish when
// the target tile's real owner isn't known client-side yet (see below) — any
// string not already in state.playerColors resolves to some deterministic
// fallback color (see resolveOwnerColor), so this never crashes; it's purely
// a stand-in until real tile data arrives and supplies the true owner.
const UNKNOWN_ENEMY_OWNER_ID = "unknown-enemy";

let advanceSrcCache: AdvanceMusterFallbackCache;
// First-observed timestamp per ADVANCE/MARCH auto-fire transit (keyed by
// target tile key), since the server tells us only transitEndsAt, not when
// the march actually started — mirrors skirmishSeenAt's own pattern for the
// same reason (this client never armed the transit itself the way it does
// for a manual attack, so there's no local startAt to read).
const advanceTransitSeenAt = new Map<string, number>();

export function syncCaptureOverlays(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  effectiveOverlayColor: (ownerId: string) => string,
  heightfield: Heightfield,
  supplyLineOverlay: SupplyLineOverlay,
): void {
  const lines = activeMusterSupplyLines(state, keyFor);
  const coveredTargetKeys = new Set(lines.map((line) => line.targetKey));

  // ADVANCE-mode auto-fire attacks never go through the client's muster
  // dispatch/transit maps (the server fires them autonomously), so fall
  // back to locating the nearest ADVANCE flag for the single tracked
  // `state.capture` countdown if it isn't already covered above.
  const capture = state.capture;
  const captureTargetKey = capture ? keyFor(capture.target.x, capture.target.y) : "";
  if (capture && !coveredTargetKeys.has(captureTargetKey) && state.tiles.get(captureTargetKey)?.ownerId) {
    const fallback = resolveAdvanceMusterFallbackSource(state, captureTargetKey, capture.target, advanceSrcCache);
    advanceSrcCache = fallback.cache;
    if (fallback.result) {
      lines.push({
        musterX: fallback.result.x,
        musterY: fallback.result.y,
        targetX: capture.target.x,
        targetY: capture.target.y,
        targetKey: captureTargetKey,
        phase: "locked"
      });
      coveredTargetKeys.add(captureTargetKey);
    }
  }

  // ADVANCE/MARCH auto-fire's own mechanical travel-time delay
  // (state.outgoingMusterAttacksByTile) — the same source the 2D renderer
  // (client-muster-supply-lines-2d.ts) and this file's own marching-company
  // mesh (syncMusterTransitOverlay below) already draw from. Without this,
  // the supply line for an auto-fired flag never appeared in 3D at all: it
  // isn't in musterTransitByTile (this client never armed it), and the
  // state.capture fallback above never covers it either (state.capture is
  // deliberately never set for these server-fired fights — see
  // handleMusterAdvanceCombatStart in client-siege-tracking.ts).
  lines.push(...outgoingMusterAttackTransitLines(state, Date.now(), coveredTargetKeys));

  if (lines.length === 0) return;

  const ownerColor = effectiveOverlayColor(state.me ?? "");
  for (const line of lines) {
    const srcDx = toroidDelta(state.camX, line.musterX, WORLD_WIDTH);
    const srcDy = toroidDelta(state.camY, line.musterY, WORLD_HEIGHT);
    const tgtDx = toroidDelta(state.camX, line.targetX, WORLD_WIDTH);
    const tgtDy = toroidDelta(state.camY, line.targetY, WORLD_HEIGHT);
    const srcSurfaceY = Math.max(heightfield.elevationAt(line.musterX, line.musterY), heightfield.cornerYAt(line.musterX, line.musterY));
    const tgtSurfaceY = Math.max(heightfield.elevationAt(line.targetX, line.targetY), heightfield.cornerYAt(line.targetX, line.targetY));
    supplyLineOverlay.addLine(
      srcDx + TILE_CENTER_OFFSET, srcDy + TILE_CENTER_OFFSET, srcSurfaceY,
      tgtDx + TILE_CENTER_OFFSET, tgtDy + TILE_CENTER_OFFSET, tgtSurfaceY,
      line.phase,
      ownerColor
    );
  }
}

// Drives the battle overlay FX from state.activeBattles — the server-
// resolved combat broadcast (see client-battle-overlay.ts), not the local
// `capture` HUD slot above, so any number of concurrent battles anywhere the
// player has vision (their own, an enemy's, or a third party's) render
// independently of this client's own in-flight action. Also renders an
// indefinite skirmish loop for tiles still counting down in
// state.incomingAttacksByTile that don't have a resolved battle yet, so the
// dots are visible for the whole siege window the red-cross overlay covers,
// not just the ~2.3s resolution flourish at the very end.
export function syncBattleOverlayFx(
  state: ClientState,
  keyFor: (x: number, y: number) => string,
  heightfield: Heightfield,
  playerColorFor: (ownerId: string) => string,
  battleOverlayFx: BattleOverlayFx,
  nowMs: number,
  // Scene-space anchor for toroidDelta placement — client-map-3d.ts's sceneOrigin
  // (the last committed terrain rebuild's window), NOT the live camera. Unlike
  // syncCaptureOverlays above (only ever called synchronously during a rebuild,
  // when state.camX/camY == the rebuild's own window), this runs every render
  // frame, so it needs the anchor threaded in explicitly or its dots/lines drift
  // off the ground during a pan inside the rebuild pad.
  originX: number,
  originY: number
): void {
  pruneExpiredActiveBattles(state, nowMs);
  // `nowMs` is performance.now() (page uptime) — the clock every battle/FX
  // timestamp is stamped in. Siege countdowns (`resolvesAt`) are server epoch
  // ms instead, so they must be compared against Date.now(); comparing them to
  // nowMs made `resolvesAt <= nowMs` permanently false (epoch ms vastly
  // outscales uptime ms) and never expired a finished siege.
  const nowEpochMs = Date.now();
  pruneExpiredIncomingAttacks(state, nowEpochMs);
  pruneExpiredOutgoingMusterAttacks(state, nowEpochMs);

  const entries: BattleOverlayRenderEntry[] = [];
  for (const battle of state.activeBattles.values()) {
    const srcDx = toroidDelta(originX, battle.originX, WORLD_WIDTH);
    const srcDy = toroidDelta(originY, battle.originY, WORLD_HEIGHT);
    const tgtDx = toroidDelta(originX, battle.targetX, WORLD_WIDTH);
    const tgtDy = toroidDelta(originY, battle.targetY, WORLD_HEIGHT);
    entries.push({
      srcWorldX: srcDx + TILE_CENTER_OFFSET,
      srcWorldZ: srcDy + TILE_CENTER_OFFSET,
      tgtWorldX: tgtDx + TILE_CENTER_OFFSET,
      tgtWorldZ: tgtDy + TILE_CENTER_OFFSET,
      srcSurfaceY: Math.max(heightfield.elevationAt(battle.originX, battle.originY), heightfield.cornerYAt(battle.originX, battle.originY)),
      tgtSurfaceY: Math.max(heightfield.elevationAt(battle.targetX, battle.targetY), heightfield.cornerYAt(battle.targetX, battle.targetY)),
      attackerColor: playerColorFor(battle.attackerOwnerId),
      defenderColor: playerColorFor(battle.defenderOwnerId),
      attackerWon: battle.attackerWon,
      startAt: battle.startAt,
      clashAt: battle.clashAt,
      endAt: battle.endAt,
      fromSkirmish: battle.fromSkirmish,
      // Same formula as the skirmish hashSeed below — keeps dot identity
      // (offset/perp/freq/phase) continuous when a battle picks up from a
      // preceding skirmish on the same tile.
      hashSeed: battle.targetX * 92821 + battle.targetY
    });
  }

  const skirmishes: BattleOverlaySkirmishEntry[] = [];
  const skirmishKeys = new Set<string>();
  const pushSkirmish = (
    key: string,
    srcX: number,
    srcY: number,
    target: { x: number; y: number },
    attackerOwnerId: string,
    defenderOwnerId: string,
    holdApproachUntilElapsed?: number
  ): void => {
    if (skirmishKeys.has(key)) return;
    skirmishKeys.add(key);
    // Also read by registerActiveBattleFromTileDelta (client-battle-overlay
    // .ts) once the resolution broadcast lands, so a resolved battle can
    // continue this exact approach trajectory instead of restarting it or
    // jumping straight to the clash oscillation.
    let startAt = state.skirmishSeenAt.get(key);
    if (startAt === undefined) {
      startAt = nowMs;
      state.skirmishSeenAt.set(key, startAt);
    }
    const srcDx = toroidDelta(originX, srcX, WORLD_WIDTH);
    const srcDy = toroidDelta(originY, srcY, WORLD_HEIGHT);
    const tgtDx = toroidDelta(originX, target.x, WORLD_WIDTH);
    const tgtDy = toroidDelta(originY, target.y, WORLD_HEIGHT);
    skirmishes.push({
      srcWorldX: srcDx + TILE_CENTER_OFFSET,
      srcWorldZ: srcDy + TILE_CENTER_OFFSET,
      tgtWorldX: tgtDx + TILE_CENTER_OFFSET,
      tgtWorldZ: tgtDy + TILE_CENTER_OFFSET,
      srcSurfaceY: Math.max(heightfield.elevationAt(srcX, srcY), heightfield.cornerYAt(srcX, srcY)),
      tgtSurfaceY: Math.max(heightfield.elevationAt(target.x, target.y), heightfield.cornerYAt(target.x, target.y)),
      attackerColor: playerColorFor(attackerOwnerId),
      defenderColor: playerColorFor(defenderOwnerId),
      startAt,
      hashSeed: target.x * 92821 + target.y,
      ...(holdApproachUntilElapsed !== undefined ? { holdApproachUntilElapsed } : {})
    });
  };

  if (state.me) {
    // Defending: ATTACK_ALERT populated incomingAttacksByTile up front.
    for (const [key, incoming] of state.incomingAttacksByTile) {
      if (incoming.resolvesAt <= nowEpochMs) continue;
      if (state.activeBattles.has(key)) continue;
      if (!incoming.attackerId || incoming.fromX === undefined || incoming.fromY === undefined) continue;
      const target = state.tiles.get(key);
      if (!target) continue;
      // Hold the approach plateau open until the real (mechanical) transit
      // delay ends, instead of the default ~3.4s march animation, so the
      // defender sees "company still approaching" for the actual travel
      // window rather than a premature clash. Computed relative to this
      // skirmish's own startAt so it stays constant frame to frame.
      const startAt = state.skirmishSeenAt.get(key) ?? nowMs;
      const holdApproachUntilElapsed =
        incoming.transitEndsAt !== undefined && incoming.transitEndsAt > nowEpochMs
          ? nowMs - startAt + (incoming.transitEndsAt - nowEpochMs)
          : undefined;
      pushSkirmish(key, incoming.fromX, incoming.fromY, target, incoming.attackerId, state.me, holdApproachUntilElapsed);
    }

    // Attacking: the server addresses ATTACK_ALERT to the defender only (see
    // runtime-frontier-command.ts), so this client's own outgoing attack never
    // reaches incomingAttacksByTile — without this it would show no dots at
    // all until the resolution flourish. Drive it off the in-flight action
    // instead. EXPAND is excluded: claiming neutral land is not a fight.
    //
    // Deliberately does NOT require state.tiles.get(key) to already know the
    // target's ownerId, unlike the defending branch above. A manual attack is
    // almost always against a tile the player is currently looking at, so
    // that tile is already loaded — but a muster flag in ADVANCE mode fires
    // autonomously against whatever the server's own search finds nearest,
    // which can be a tile this client has never had vision of. Requiring a
    // known owner there silently skipped the skirmish for the entire ~30s
    // countdown, only for it to appear once resolution's tile delta reveals
    // the target and populates activeBattles — reading as "no animation
    // until it resolves". actionType === "ATTACK" already guarantees
    // (server-validated) this targets a real enemy tile, so a placeholder
    // color is a safe stand-in until real tile data upgrades it on a later
    // frame, exactly like a bystander's fog-of-war tinting already does.
    const capture = state.capture;
    if (capture?.actionType === "ATTACK" && capture.origin && capture.resolvesAt > nowEpochMs) {
      const key = keyFor(capture.target.x, capture.target.y);
      if (!state.activeBattles.has(key)) {
        const knownOwnerId = state.tiles.get(key)?.ownerId;
        const defenderOwnerId = knownOwnerId && knownOwnerId !== state.me ? knownOwnerId : UNKNOWN_ENEMY_OWNER_ID;
        pushSkirmish(key, capture.origin.x, capture.origin.y, capture.target, state.me, defenderOwnerId);
      }
    }

    // A muster flag's ADVANCE- or MARCH-mode auto-fire attack: the server
    // dispatches it without this client ever submitting anything, so it never
    // occupies the single-slot `capture` above (see handleMusterAdvanceCombatStart
    // in client-siege-tracking.ts) and needs its own keyed loop here instead.
    // Same reasoning as the manual-attack branch above for not requiring
    // state.tiles.get(key): an auto-fired swing can target a tile this
    // client has never had vision of.
    for (const [key, outgoing] of state.outgoingMusterAttacksByTile) {
      // EXPAND is excluded, same as the manual-attack branch above: claiming
      // neutral land isn't a fight, so it gets no skirmish FX — the transit
      // overlay's arrow simply comes to rest on the tile once resolvesAt
      // passes instead of switching into clash animation.
      if (outgoing.isExpand || outgoing.resolvesAt <= nowEpochMs || state.activeBattles.has(key)) continue;
      // While the funding flag's company is still marching (mechanical
      // travel-time delay -- see runtime-frontier-command.ts), the fight
      // hasn't reached the target tile yet: the transit overlay
      // (syncMusterTransitOverlay) shows the march, not this skirmish.
      if (outgoing.transitEndsAt !== undefined && outgoing.transitEndsAt > nowEpochMs) continue;
      const knownOwnerId = state.tiles.get(key)?.ownerId;
      const defenderOwnerId = knownOwnerId && knownOwnerId !== state.me ? knownOwnerId : UNKNOWN_ENEMY_OWNER_ID;
      pushSkirmish(key, outgoing.originX, outgoing.originY, { x: outgoing.targetX, y: outgoing.targetY }, state.me, defenderOwnerId);
    }
  }

  // Prune stale seenAt entries so a fight that ends and later restarts on the
  // same tile gets a fresh approach instead of reusing an old timestamp.
  // Deliberately NOT scoped to skirmishKeys (this frame's *drawn* skirmishes)
  // alone: pushSkirmish above stops firing for a tile the instant its
  // resolvesAt passes, but the resolution broadcast reliably lands a little
  // later (server tick + network), and registerActiveBattleFromTileDelta
  // needs to find this tile's seenAt intact when it does. incomingAttacksByTile
  // and capture already encode that same grace window in their own eviction
  // rules, so anything they still reference (or activeBattles now owns) stays.
  const stillRelevant = new Set(skirmishKeys);
  for (const key of state.activeBattles.keys()) stillRelevant.add(key);
  if (state.me) {
    for (const key of state.incomingAttacksByTile.keys()) stillRelevant.add(key);
    for (const key of state.outgoingMusterAttacksByTile.keys()) stillRelevant.add(key);
    const capture = state.capture;
    if (capture?.actionType === "ATTACK") stillRelevant.add(keyFor(capture.target.x, capture.target.y));
  }
  for (const key of state.skirmishSeenAt.keys()) {
    if (!stillRelevant.has(key)) state.skirmishSeenAt.delete(key);
  }

  if (entries.length === 0 && skirmishes.length === 0) { battleOverlayFx.clear(); return; }
  battleOverlayFx.tick(nowMs, entries, skirmishes);
}

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
  originY: number
): void {
  const nowEpochMs = Date.now();
  transitOverlay.clear();
  const ownerColor = effectiveOverlayColor(state.me ?? "");

  // Builds and adds one company's march, from (musterX,musterY) to
  // (marchToX,marchToY) — the firing tile the transit's duration is
  // actually budgeted for, NOT necessarily the real attack target (a
  // remotely-funded attack's flag only marches to the front; the
  // adjacency-only "hop" from there onto the target is the ATTACK itself,
  // not additional travel — see MusterTransitEntry's marchToX comment).
  const addMarch = (musterX: number, musterY: number, marchToX: number, marchToY: number, startAt: number, arriveAt: number): void => {
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
      ownerColor
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

  transitOverlay.commit();
  transitOverlay.tick(nowEpochMs);
}

// First-observed timestamp per ADVANCE/MARCH auto-fired EXPAND's claim phase
// (keyed by target tile key), for the same reason advanceTransitSeenAt above
// tracks the travel phase: the server tells us only resolvesAt (and,
// separately, transitEndsAt for the travel leg), never when the claim itself
// actually started, so a claim that already has transitEndsAt in the past
// uses that as its authoritative start; only a claim this client observes
// mid-flight with no transit leg at all (transitEndsAt never set) falls back
// to "the first frame this client saw it".
const advanceClaimSeenAt = new Map<string, number>();

// Drives the frontier-claim plate pool from every currently-claiming EXPAND:
// this client's own manually-dispatched claim (the single state.capture
// slot, same source syncFrontierClaimPlate used to read exclusively) plus
// any number of this player's muster flags auto-firing an EXPAND via
// ADVANCE/MARCH (state.outgoingMusterAttacksByTile, isExpand entries --
// populated by handleMusterAdvanceExpandAccepted in client-siege-tracking.ts,
// the same source syncMusterTransitOverlay/syncBattleOverlayFx above already
// read for the travel and skirmish legs of the very same auto-fired action).
// Without this second source, a MARCH flag fighting through neutral ground
// showed the marching-company travel animation while it approached the tile
// (syncMusterTransitOverlay) but then nothing at all once the claim itself
// started -- the single-slot plate this function replaces only ever knew
// about this client's OWN dispatched claim, never a server-auto-fired one.
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

  // This client's own claim first -- authoritative startAt from the moment
  // it was actually dispatched, and takes priority over a muster entry that
  // happens to share the same target tile.
  const capture = state.capture;
  if (capture && capture.actionType === "EXPAND" && !capture.fromMusterAdvance && capture.resolvesAt > nowEpochMs) {
    const key = keyFor(capture.target.x, capture.target.y);
    claims.push({ targetX: capture.target.x, targetY: capture.target.y, startAt: capture.startAt, resolvesAt: capture.resolvesAt });
    coveredTargetKeys.add(key);
  }

  const liveClaimKeys = new Set<string>();
  for (const [key, outgoing] of state.outgoingMusterAttacksByTile) {
    if (!outgoing.isExpand || outgoing.resolvesAt <= nowEpochMs || coveredTargetKeys.has(key)) continue;
    // While the flag's company is still marching, the transit overlay shows
    // that leg, not this one -- same phase split syncBattleOverlayFx's
    // skirmish loop above uses for an auto-fired ATTACK.
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
