import { FRONTIER_CLAIM_COST } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

// Split out of client-queue-logic.ts (over the repo's 500-line growth cap),
// which re-exports both entry points so existing importers are unchanged.

export const queueSpecificTargets = (
  state: ClientState,
  targetKeys: string[],
  deps: {
    parseKey: (key: string) => { x: number; y: number };
    keyFor: (x: number, y: number) => string;
    isTileOwnedByAlly: (tile: Tile) => boolean;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
    enqueueTarget: (x: number, y: number) => boolean;
    buildFrontierQueue: (candidates: string[], enqueue: (x: number, y: number) => boolean) => { queued: number; skipped: number; queuedKeys: string[] };
  }
): { queued: number; skipped: number; queuedKeys: string[] } => {
  const neutralTargets: string[] = [];
  const attackTargets: string[] = [];
  for (const targetKey of targetKeys) {
    const tile = state.tiles.get(targetKey);
    if (!tile || tile.terrain !== "LAND" || tile.fogged) continue;
    if (!tile.ownerId) neutralTargets.push(targetKey);
    else if (tile.ownerId !== state.me && !deps.isTileOwnedByAlly(tile)) attackTargets.push(targetKey);
  }

  const neutralResult = deps.buildFrontierQueue(neutralTargets, (x, y) => deps.enqueueTarget(x, y));
  const queuedKeys = [...neutralResult.queuedKeys];
  let queued = neutralResult.queued;
  let skipped = neutralResult.skipped;

  for (const targetKey of attackTargets) {
    if (!state.tiles.get(targetKey)) {
      skipped += 1;
      continue;
    }
    const { x, y } = deps.parseKey(targetKey);
    if (!deps.pickOriginForTarget(x, y)) {
      skipped += 1;
      continue;
    }
    if (!deps.enqueueTarget(x, y)) {
      skipped += 1;
      continue;
    }
    queued += 1;
    queuedKeys.push(targetKey);
  }

  return { queued, skipped, queuedKeys };
};

export const attackQueueFailureReason = (
  state: ClientState,
  tile: Tile,
  deps: {
    ownerSpawnShieldActive: (ownerId: string) => boolean;
    pickOriginForTarget: (x: number, y: number) => Tile | undefined;
  }
): string => {
  if (tile.ownerId && tile.ownerId !== state.me && deps.ownerSpawnShieldActive(tile.ownerId)) return "That empire is still under spawn protection.";
  if (state.gold < FRONTIER_CLAIM_COST) return `Need ${FRONTIER_CLAIM_COST} coin.`;
  if (!deps.pickOriginForTarget(tile.x, tile.y)) {
    return tile.dockId ? "No owned linked dock can reach this target." : "Target must border your territory or a linked dock.";
  }
  return "Action could not be queued.";
};
