/**
 * Which AFC_MODULE techs a player can build with. A module is usable when a
 * copy sits on an active AFC the player owns on SETTLED ground -- whether
 * the player researched it (a House copy) or captured it with the AFC.
 * Research alone is not enough: an uninstalled module unlocks nothing.
 * Non-module techs still need research. Shared by the build handler, the
 * auto-improve pass and the AI planner export so they cannot disagree.
 */
import type { DomainTileState } from "@border-empires/game-domain";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";

export const isAfcModuleTech = (techId: string): boolean => techEntryById.get(techId)?.manifestCategory === "AFC_MODULE";

/**
 * Module tech ids installed on the player's active, settled, owned AFCs.
 * afcKeys narrows the scan to the player's AFC tiles; without it every tile is checked.
 */
export function installedAfcModuleTechIds(
  playerId: string,
  tiles: ReadonlyMap<string, DomainTileState>,
  afcKeys?: Iterable<string>
): Set<string> {
  const installed = new Set<string>();
  const candidates = afcKeys ? [...afcKeys].map((key) => tiles.get(key)) : tiles.values();
  for (const tile of candidates) {
    if (tile?.ownerId !== playerId || tile.ownershipState !== "SETTLED" || tile.afc?.status !== "active" || tile.afc.ownerId !== playerId) continue;
    for (const techId of tile.afc.modules ?? []) installed.add(techId);
  }
  return installed;
}

/** True when techId lets this player build: an installed module, or a researched non-module tech. */
export const canBuildWithTech = (researched: ReadonlySet<string>, installedModules: ReadonlySet<string>, techId: string): boolean =>
  isAfcModuleTech(techId) ? installedModules.has(techId) : researched.has(techId);
