import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import type { Heightfield } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import type { BattleOverlayFx, BattleOverlayRenderEntry, BattleOverlaySkirmishEntry } from "./client-map-3d-battle-overlay-fx.js";
import { pruneExpiredActiveBattles } from "./client-battle-overlay/client-battle-overlay.js";
import { pruneExpiredIncomingAttacks } from "./client-siege-tracking/client-siege-tracking.js";
import { activeMusterSupplyLines, resolveAdvanceMusterFallbackSource, type AdvanceMusterFallbackCache } from "./client-muster-transit/client-muster-transit.js";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { SupplyLineOverlay } from "./client-map-3d-supply-line-overlay.js";
import type { ClientState } from "./client-state/client-state.js";

const TILE_CENTER_OFFSET = 0.5;

// Placeholder passed to playerColorFor for the attacker's own skirmish when
// the target tile's real owner isn't known client-side yet (see below) — any
// string not already in state.playerColors resolves to some deterministic
// fallback color (see resolveOwnerColor), so this never crashes; it's purely
// a stand-in until real tile data arrives and supplies the true owner.
const UNKNOWN_ENEMY_OWNER_ID = "unknown-enemy";

let advanceSrcCache: AdvanceMusterFallbackCache;

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
    }
  }

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
  nowMs: number
): void {
  pruneExpiredActiveBattles(state, nowMs);
  // `nowMs` is performance.now() (page uptime) — the clock every battle/FX
  // timestamp is stamped in. Siege countdowns (`resolvesAt`) are server epoch
  // ms instead, so they must be compared against Date.now(); comparing them to
  // nowMs made `resolvesAt <= nowMs` permanently false (epoch ms vastly
  // outscales uptime ms) and never expired a finished siege.
  const nowEpochMs = Date.now();
  pruneExpiredIncomingAttacks(state, nowEpochMs);

  const entries: BattleOverlayRenderEntry[] = [];
  for (const battle of state.activeBattles.values()) {
    const srcDx = toroidDelta(state.camX, battle.originX, WORLD_WIDTH);
    const srcDy = toroidDelta(state.camY, battle.originY, WORLD_HEIGHT);
    const tgtDx = toroidDelta(state.camX, battle.targetX, WORLD_WIDTH);
    const tgtDy = toroidDelta(state.camY, battle.targetY, WORLD_HEIGHT);
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
    defenderOwnerId: string
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
    const srcDx = toroidDelta(state.camX, srcX, WORLD_WIDTH);
    const srcDy = toroidDelta(state.camY, srcY, WORLD_HEIGHT);
    const tgtDx = toroidDelta(state.camX, target.x, WORLD_WIDTH);
    const tgtDy = toroidDelta(state.camY, target.y, WORLD_HEIGHT);
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
      hashSeed: target.x * 92821 + target.y
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
      pushSkirmish(key, incoming.fromX, incoming.fromY, target, incoming.attackerId, state.me);
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
    const capture = state.capture;
    if (capture?.actionType === "ATTACK") stillRelevant.add(keyFor(capture.target.x, capture.target.y));
  }
  for (const key of state.skirmishSeenAt.keys()) {
    if (!stillRelevant.has(key)) state.skirmishSeenAt.delete(key);
  }

  if (entries.length === 0 && skirmishes.length === 0) { battleOverlayFx.clear(); return; }
  battleOverlayFx.tick(nowMs, entries, skirmishes);
}
