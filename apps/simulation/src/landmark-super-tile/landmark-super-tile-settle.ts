import type { DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "../seed-state/seed-state.js";
import type { SettlementStartInput } from "../runtime/runtime-settlement-start.js";
import { superTileActionTarget } from "./landmark-super-tile.js";

/**
 * Every garrison path (manual, queued, auto-settle, captured-anchor) funnels
 * through Runtime.startSettlementProcess. On an AFC/relic super tile it is
 * one garrison for the whole site: the settlement runs on the centre, and a
 * second start on any member while one is pending (or while the centre is
 * under attack) is dropped before anything is charged.
 */
export const superTileSettlementStart = (
  tiles: { get(key: string): DomainTileState | undefined },
  pendingSettlementsByTile: { has(key: string): boolean },
  isCentreUnderAttack: (key: string) => boolean,
  requested: SettlementStartInput
): SettlementStartInput | undefined => {
  const centre = superTileActionTarget(tiles, requested.target);
  if (centre === requested.target) return requested;
  const targetKey = simulationTileKey(centre.x, centre.y);
  if (pendingSettlementsByTile.has(targetKey) || isCentreUnderAttack(targetKey)) return undefined;
  if (centre.ownerId !== requested.playerId || centre.ownershipState !== "FRONTIER") return undefined;
  return { ...requested, targetKey, target: centre };
};
