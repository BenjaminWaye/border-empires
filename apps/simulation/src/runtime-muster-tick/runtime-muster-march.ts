import type { DomainTileState } from "@border-empires/game-domain";
import { chebyshevDistanceSimple, coordsInChebyshevRadius } from "../territory-automation/territory-automation.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import type { MusterTickInput } from "./runtime-muster-tick.js";
import { ADVANCE_EMPTY_COOLDOWN_MS, ADVANCE_FAR_COOLDOWN_MS, ADVANCE_THROTTLE_DIST, lockSourcedFromMusterTile, syncMusterStatus } from "./muster-auto-fire-shared.js";

/**
 * MARCH auto-fire: like ADVANCE, but instead of firing at the nearest
 * attackable enemy tile, it steers toward a chosen (targetX, targetY) tile.
 * The BFS crosses the player's own owned tiles, collecting every attackable
 * enemy tile found along the way, plus every neutral (unowned) LAND tile
 * bordering owned territory as an EXPAND candidate.
 *
 * Candidates are ranked by total road length, not just remaining distance:
 * (toroidal Chebyshev distance from the muster flag itself to the candidate)
 * + (distance from the candidate to the march target). This is the flag's
 * whole trip — out to the candidate, then imagining the rest of the way to
 * the target — not just "how close is this candidate to the target", so a
 * candidate that's technically nearer the target but far out of the flag's
 * way doesn't win over one that's a short hop from the flag and still makes
 * good progress toward the target. MARCH then picks whichever candidate,
 * attack or expand, has the shorter total road, since the point of MARCH is
 * the fastest route to the target regardless of whether that route is
 * fought or walked. An attack is used as a tiebreak when both are equal.
 *
 * Every command MARCH issues (ATTACK or EXPAND) carries musterSourceX/Y set
 * to the flag's own tile, not whatever intermediate owned tile the BFS
 * launches the final hop from — runtime-frontier-command.ts uses that to
 * charge the same mechanical travel-time delay against both, attributed to
 * the flag itself, matching a company that has to march the whole way there
 * regardless of which command it ultimately executes.
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
    // Verbatim resolvesAt, never Math.max(…, nowMs) — see the matching
    // comment in runtime-muster-tick.ts: re-clamping an overdue lock to nowMs
    // defeats syncMusterStatus's equality guard and persists a tile-delta
    // event every tick for as long as the lock stays stuck.
    const resolvesAt = inFlightLock.resolvesAt;
    input.advanceCooldowns.set(originKey, resolvesAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: true,
      nextActionAt: resolvesAt,
      fightX: inFlightLock.targetX,
      fightY: inFlightLock.targetY
    });
    return;
  }

  // Not a new search, so carry the previous search's reason forward instead
  // of clearing it back to the generic cooldown text for the rest of the
  // cooldown window — see the matching comment in maybeAdvanceFire.
  const cooldownUntil = input.advanceCooldowns.get(originKey) ?? 0;
  if (input.nowMs < cooldownUntil) {
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: false,
      nextActionAt: cooldownUntil,
      noTargetInRange: musterTile.muster?.noTargetInRange,
      insufficientManpower: musterTile.muster?.insufficientManpower
    });
    return;
  }

  if (musterAmount <= 0) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, { inFlight: false, nextActionAt, insufficientManpower: true });
    return;
  }

  const getTile = (x: number, y: number): DomainTileState | undefined =>
    input.tiles.get(simulationTileKey(x, y));

  // BFS through connected owned tiles, collecting every attackable enemy
  // tile found along the way instead of stopping at the first one, plus
  // every neutral (unowned) LAND tile bordering owned territory as an
  // EXPAND candidate.
  const visited = new Set<string>([originKey]);
  const queue: DomainTileState[] = [musterTile];
  let head = 0;
  let best: { from: DomainTileState; enemy: DomainTileState; totalRoadDist: number } | undefined;
  let bestExpand: { from: DomainTileState; neutral: DomainTileState; totalRoadDist: number } | undefined;
  // Nearest reachable/unlocked enemy tile regardless of affordability — see
  // the matching field in maybeAdvanceFire for why this is tracked
  // separately from `best`.
  let foundUnaffordable = false;

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
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey)
      ) {
        if (musterAmount >= input.requiredMusterForTarget(neighbor)) {
          const totalRoadDist =
            chebyshevDistanceSimple(musterTile.x, musterTile.y, neighbor.x, neighbor.y) +
            chebyshevDistanceSimple(neighbor.x, neighbor.y, targetX, targetY);
          if (!best || totalRoadDist < best.totalRoadDist) {
            best = { from: current, enemy: neighbor, totalRoadDist };
          }
        } else {
          foundUnaffordable = true;
        }
      } else if (
        !neighbor.ownerId &&
        !input.locksByTile.has(currentKey) &&
        !input.locksByTile.has(nKey) &&
        input.isInReach(playerId, x, y)
      ) {
        const totalRoadDist =
          chebyshevDistanceSimple(musterTile.x, musterTile.y, x, y) +
          chebyshevDistanceSimple(x, y, targetX, targetY);
        if (!bestExpand || totalRoadDist < bestExpand.totalRoadDist) {
          bestExpand = { from: current, neutral: neighbor, totalRoadDist };
        }
      }
    }
  }

  if (!best && !bestExpand) {
    const nextActionAt = input.nowMs + ADVANCE_EMPTY_COOLDOWN_MS;
    input.advanceCooldowns.set(originKey, nextActionAt);
    syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
      inFlight: false,
      nextActionAt,
      insufficientManpower: foundUnaffordable,
      noTargetInRange: !foundUnaffordable
    });
    return;
  }

  // Shortest total road from the flag, through the candidate, to the target
  // wins, whether that road is fought or walked; an attack is the tiebreak
  // when both are equally short.
  const useAttack = !!best && (!bestExpand || best.totalRoadDist <= bestExpand.totalRoadDist);

  const totalRoadDist = useAttack ? best!.totalRoadDist : bestExpand!.totalRoadDist;
  if (totalRoadDist > ADVANCE_THROTTLE_DIST) {
    input.advanceCooldowns.set(originKey, input.nowMs + ADVANCE_FAR_COOLDOWN_MS);
  } else {
    input.advanceCooldowns.delete(originKey); // next tick
  }

  const from = useAttack ? best!.from : bestExpand!.from;
  const to = useAttack ? best!.enemy : bestExpand!.neutral;
  // The command fires unconditionally below — mark in-flight now rather than
  // waiting for the lock to show up next tick.
  syncMusterStatus(input, musterTile, originKey, playerId, input.nowMs, {
    inFlight: true,
    nextActionAt: undefined,
    fightX: to.x,
    fightY: to.y
  });
  const commandId = input.nextTerritoryAutomationCommandId(
    "muster-march",
    playerId,
    simulationTileKey(to.x, to.y),
    input.nowMs
  );
  input.handleFrontierCommand(
    {
      commandId,
      sessionId: `system-runtime:territory-automation:${playerId}`,
      playerId,
      clientSeq: 0,
      issuedAt: input.nowMs,
      type: useAttack ? "ATTACK" : "EXPAND",
      payloadJson: JSON.stringify({
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        musterSourceX: musterTile.x,
        musterSourceY: musterTile.y
      })
    },
    useAttack ? "ATTACK" : "EXPAND"
  );
};
