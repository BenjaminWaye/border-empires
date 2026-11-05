import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { ATTACK_MANPOWER_MIN, expandManpowerCostForFrontierCount, FRONTIER_CLAIM_COST } from "@border-empires/shared";
import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import type { LockRecord } from "../runtime-types.js";

export function planDirectFrontierCommand(input: {
  tiles: ReadonlyMap<string, DomainTileState>; ownedTiles: readonly DomainTileState[];
  locks: Iterable<Pick<LockRecord, "playerId">>; dockLinks: ReadonlyMap<string, readonly string[]>;
  playerId: string; points: number; manpower: number; frontierTileCount: number; clientSeq: number; issuedAt: number;
  sessionPrefix: "ai-runtime" | "system-runtime";
}): CommandEnvelope | undefined {
  for (const lock of input.locks) if (lock.playerId === input.playerId) return undefined;
  return chooseNextOwnedFrontierCommandFromLookup(input.tiles, input.ownedTiles, input.playerId, input.clientSeq, input.issuedAt, input.sessionPrefix, {
    canAttack: input.points >= FRONTIER_CLAIM_COST && input.manpower >= ATTACK_MANPOWER_MIN,
    canExpand: input.points >= FRONTIER_CLAIM_COST && input.manpower >= expandManpowerCostForFrontierCount(input.frontierTileCount),
    dockLinksByDockTileKey: input.dockLinks
  });
}
