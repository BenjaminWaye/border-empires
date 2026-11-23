import type { DomainTileState } from "@border-empires/game-domain";
import { razedWreckFieldsOnCapture, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import { capturedStructureFields } from "../capture-structures/capture-structures.js";
import type { SimulationTileWireDelta } from "../runtime-types.js";

const BARBARIAN_PLAYER_ID = "barbarian-1";

export type EncirclementPocketCaptureContext = {
  tiles: Map<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  /** True while an EXPAND/ATTACK/etc. lock holds the tile; such tiles are never handed over. */
  hasTileLock?: (tileKey: string) => boolean;
};

const neighborKeys = (key: string): string[] => {
  const comma = key.indexOf(",");
  const x = Number(key.slice(0, comma));
  const y = Number(key.slice(comma + 1));
  const keys: string[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx !== 0 || dy !== 0) keys.push(`${wrapX(x + dx, WORLD_WIDTH)},${wrapY(y + dy, WORLD_HEIGHT)}`);
    }
  }
  return keys;
};

/** True when `key` is cut off and touches land `claimantId` holds. */
const cutOffTouchingClaimant = (
  tiles: ReadonlyMap<string, DomainTileState>,
  cutOff: ReadonlySet<string>,
  claimantId: string,
  key: string
): boolean => cutOff.has(key) && neighborKeys(key).some((nk) => tiles.get(nk)?.ownerId === claimantId);

/**
 * The cut-off tiles reachable by plain 8-neighbour steps through cut-off
 * tiles from a claimant-held changed tile, or from a changed tile that is
 * itself cut off and touches the claimant's land (a SETTLED tile the
 * claimant's reach just unsettled -- see unsettle-encirclement.ts). Cut-off
 * components reached only through the cut-off player's Aether bridges or
 * dock sea lanes are left out: the claimant has no such link, so they would
 * land unsupplied.
 */
const landAdjacentPocket = (
  tiles: ReadonlyMap<string, DomainTileState>,
  cutOff: ReadonlySet<string>,
  claimantId: string,
  changedKeys: readonly string[]
): Set<string> => {
  const pocket = new Set<string>();
  const queue: string[] = [];
  for (const key of changedKeys) {
    if (cutOffTouchingClaimant(tiles, cutOff, claimantId, key) && !pocket.has(key)) {
      pocket.add(key);
      queue.push(key);
    }
    if (tiles.get(key)?.ownerId !== claimantId) continue;
    for (const nk of neighborKeys(key)) {
      if (cutOff.has(nk) && !pocket.has(nk)) {
        pocket.add(nk);
        queue.push(nk);
      }
    }
  }
  for (let head = 0; head < queue.length; head += 1) {
    for (const nk of neighborKeys(queue[head]!)) {
      if (cutOff.has(nk) && !pocket.has(nk)) {
        pocket.add(nk);
        queue.push(nk);
      }
    }
  }
  return pocket;
};

/**
 * Whether `claimantId` may take the frontier an enemy capture just cut off.
 * Only a real player who now holds one of the changed tiles, or holds land
 * next to one, qualifies (the pocket it takes is then limited to land
 * touching that tile -- see landAdjacentPocket). Barbarians never claim pockets (their land is SETTLED-only and ownerless
 * on loss), and a changed tile the claimant no longer holds (e.g. a
 * barbarian defender's tile released back to neutral) gives no claim.
 */
export const canClaimEncirclementPocket = (
  tiles: ReadonlyMap<string, DomainTileState>,
  claimantId: string | undefined,
  cutOffPlayerId: string,
  changedKeys: readonly string[]
): claimantId is string =>
  Boolean(claimantId) &&
  claimantId !== cutOffPlayerId &&
  claimantId !== BARBARIAN_PLAYER_ID &&
  changedKeys.some((key) => tiles.get(key)?.ownerId === claimantId || neighborKeys(key).some((nk) => tiles.get(nk)?.ownerId === claimantId));

/**
 * Hands cut-off FRONTIER tiles to the player whose capture cut them off,
 * instead of releasing them to neutral (which left an empty, unclaimable
 * pocket inside the captor's lines). The tile lands as the captor's
 * FRONTIER, with buildings following the ordinary capture rules
 * (capturedStructureFields) and any muster flag or sabotage dropped. No
 * capture hold is granted: these tiles were never fought over.
 *
 * Only land touching a claimant-held changed tile (or a cut-off changed
 * tile bordering the claimant) is taken. Kept on the
 * neutral release: tiles reached only over the cut-off player's bridges or
 * sea lanes, town tiles (a town changing hands runs the capture aftermath
 * -- population loss, settlement relocation -- that only a real ATTACK
 * resolves), and tiles an in-flight lock holds (a pending attack must not
 * resolve against its own side or an ally). Returns the deltas to emit for
 * the claimant, the muster clears to broadcast, and the keys left for the
 * caller to release.
 */
export function captureEncirclementPocket(
  context: EncirclementPocketCaptureContext,
  cutOff: ReadonlySet<string>,
  claimantId: string,
  changedKeys: readonly string[],
  commandId: string,
  nowMs: number
): { tileDeltas: SimulationTileWireDelta[]; broadcastMusterClears: SimulationTileWireDelta[]; releaseKeys: string[] } {
  const tileDeltas: SimulationTileWireDelta[] = [];
  const broadcastMusterClears: SimulationTileWireDelta[] = [];
  const releaseKeys: string[] = [];
  const pocket = landAdjacentPocket(context.tiles, cutOff, claimantId, changedKeys);
  for (const key of cutOff) {
    const tile = context.tiles.get(key);
    if (!tile || tile.ownershipState !== "FRONTIER") continue;
    if (!pocket.has(key) || tile.town || context.hasTileLock?.(key)) {
      releaseKeys.push(key);
      continue;
    }
    const captured: DomainTileState = {
      ...tile,
      ownerId: claimantId,
      ownershipState: "FRONTIER",
      frontierDecayAt: undefined,
      frontierDecayKind: undefined,
      captureHoldUntil: undefined,
      breachShockUntil: undefined,
      healAt: undefined,
      muster: undefined,
      sabotage: undefined,
      ...capturedStructureFields(tile, claimantId, nowMs),
      ...razedWreckFieldsOnCapture(tile, nowMs)
    };
    context.replaceTileState(key, captured, commandId);
    // musterJson isn't in tileDeltaFromState's output: stamp the clear and
    // broadcast it, as bombardment does, or clients keep drawing the flag.
    const delta = context.tileDeltaFromState(captured);
    if (tile.muster) {
      delta.musterJson = "";
      broadcastMusterClears.push({ x: captured.x, y: captured.y, ownerId: claimantId, ownershipState: "FRONTIER", musterJson: "" });
    }
    tileDeltas.push(delta);
  }
  return { tileDeltas, broadcastMusterClears, releaseKeys };
}
