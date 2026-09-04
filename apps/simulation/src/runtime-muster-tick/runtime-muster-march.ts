import type { DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { ADVANCE_EMPTY_COOLDOWN_MS, ADVANCE_FAR_COOLDOWN_MS, ADVANCE_THROTTLE_DIST, lockSourcedFromMusterTile, syncMusterStatus } from "./muster-auto-fire-shared.js";

/**
 * MARCH auto-fire: like ADVANCE, but instead of firing at the nearest
 * attackable enemy tile, it steers toward a chosen (targetX, targetY) tile.
 * The BFS still only crosses the player's own owned tiles (never neutral
 * ground — MARCH attacks enemy tiles, it never expands onto unclaimed
 * territory), and only enemy-owned tiles are ever fired on. Among every
 * attackable enemy tile reachable via that BFS, it picks the one closest
 * (toroidal Chebyshev distance) to the march target, so the flag fights its
 * way toward the target by the shortest remaining route rather than just
 * hitting whatever enemy tile happens to be nearest the flag itself.
 */
export const maybeMarchFire = (input: MusterTickInput, musterTile: DomainTileState, playerId: string): void => {
  const musterAmount = musterTile.muster?.amount ?? 0;
  const originKey = simulationTileKey(musterTile.x, musterTile.y);
  const targetX = musterTile.muster?.targetX;
  const targetY = musterTile.muster?.targetY;

  if (targetX === undefined || targetY === undefined) {
    // No target set (shouldn't happen — SET_MUSTER requires one for MARCH) —
    // nothing to steer toward, so just back off.
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt });
    return;
  }

  // Target already ours — the march is complete. Fall back to HOLD so the
  // flag stops searching and the client sees the march end.
  const targetTile = input.tiles.get(simulationTileKey(targetX, targetY));
  if (targetTile?.ownerId === playerId) {
    const { targetX: _targetX, targetY: _targetY, ...restMuster } = musterTile.muster!;
    const clearedTile: DomainTileState = {
      ...musterTile,
      muster: { ...restMuster, mode: "HOLD" }
    };
    input.replaceTileState(originKey, clearedTile);
    input.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      commandId: `muster-march-complete:${playerId}:${originKey}:${input.nowMs}`,
      playerId,
      tileDeltas: [input.tileDeltaFromState(clearedTile)]
    });
    input.advanceCooldowns.delete(originKey);
    return;
  }

  const inFlightLock = lockSourcedFromMusterTile(input.locksByTile, originKey);
  if (inFlightLock) {
    const resolvesAt = Math.max(inFlightLock.resolvesAt, input.nowMs);
    input.advanceCooldowns.set(originKey, resolvesAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: true,
      nextActionAt: resolvesAt,
      fightX: inFlightLock.targetX,
      fightY: inFlightLock.targetY
    });
    return;
  }

  const cooldownUntil = input.advanceCooldowns.get(originKey) ?? 0;
  if (input.nowMs < cooldownUntil) {
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt: cooldownUntil });
    return;
  }

  if (musterAmount <= 0) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt });
    return;
  }

  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // BFS through connected owned tiles (same reachability rule as ADVANCE —
  // never through neutral ground), collecting every attackable enemy tile
  // found along the way instead of stopping at the first one.
  const visited = new Set<string>([originKey]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let best: { from: DomainTileState; enemy: DomainTileState; distToTarget: number } | undefined;

  while (head < queue.length) {
    const current = queue[head++]!;
    const currentKey = simulationTileKey(current.x, current.y);

    const dockLinkedKeys = input.dockLinksByDockTileKey.get(currentKey) ?? [];
    const neighborCoords = [
      ...coordsInChebyshevRadius(current.x, current.y, 1),
      ...dockLinkedKeys.map((key) => {
        const [nx, ny] = key.split(",").map(Number);
        return { x: nx!, y: ny! };
      })
    ];

    for (const { x, y } of neighborCoords) {
      const neighbor = getTile(x, y);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      const nKey = simulationTileKey(x, y);

      if (neighbor.ownerId === playerId) {
        if (!visited.has(nKey)) {
          visited.add(nKey);
          queue.push(neighbor);
        }
      } else if (
        neighbor.ownerId &&
        (neighbor.ownershipState === "FRONTIER" || neighbor.ownershipState === "SETTLED" || neighbor.ownershipState === "BARBARIAN") &&
        musterAmount >= input.requiredMusterForTarget(neighbor) &&
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey)
      ) {
        const distToTarget = chebyshevDistanceSimple(neighbor.x, neighbor.y, targetX, targetY);
        if (!best || distToTarget < best.distToTarget) {
          best = { from: current, enemy: neighbor, distToTarget };
        }
      }
    }
  }

  if (!best) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt });
    return;
  }

  if (best.distToTarget > ADVANCE_THROTTLE_DIST) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
  } else {
    input.advanceCooldowns.delete(originKey); // next tick
  }
  // The attack fires unconditionally below — mark in-flight now rather than
  // waiting for the lock to show up next tick.
  syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
    inFlight: true,
    nextActionAt: undefined,
    fightX: best.enemy.x,
    fightY: best.enemy.y
  });

  const commandId = input.nextTerritoryAutomationCommandId(
    "muster-march",
    playerId,
    simulationTileKey(best.enemy.x, best.enemy.y),
    input.nowMs
  );
  input.handleFrontierCommand(
    {
      commandId,
      sessionId: `system-runtime:territory-automation:${playerId}`,
      playerId,
      clientSeq: 0,
      issuedAt: input.nowMs,
      type: "ATTACK",
      payloadJson: JSON.stringify({
        fromX: best.from.x,
        fromY: best.from.y,
        toX: best.enemy.x,
        toY: best.enemy.y,
        musterSourceX: musterTile.x,
        musterSourceY: musterTile.y
      })
    },
    "ATTACK"
  );
};
