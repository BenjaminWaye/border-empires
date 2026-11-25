/**
 * Which AFC_MODULE techs a player can build with. A module is usable when a
 * copy sits on an active AFC the player owns on SETTLED ground -- whether
 * the player researched it (a House copy) or captured it with the AFC.
 * For a building's own unlock tech, research alone is not enough: an
 * uninstalled module unlocks nothing. Fort/Siege tier techs accept research
 * or an installed copy (the build handler's hasTech). Non-module techs still
 * need research. Abilities (hasAbilityAccess) accept research or an
 * installed copy, so a captured module casts for its captor. Shared by the build handler, the
 * auto-improve pass and the AI planner export so they cannot disagree.
 */
import { playerHasAbilityTech, type AbilityId, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";
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
  return installedAfcModuleTechIdsAmong(playerId, afcKeys ? [...afcKeys].map((key) => tiles.get(key)) : tiles.values());
}

/** Same as installedAfcModuleTechIds over any tile list (e.g. the player's settled tiles, which include their AFCs). */
export function installedAfcModuleTechIdsAmong(playerId: string, tiles: Iterable<DomainTileState | undefined>): Set<string> {
  const installed = new Set<string>();
  for (const tile of tiles) {
    if (tile?.ownerId !== playerId || tile.ownershipState !== "SETTLED" || tile.afc?.status !== "active" || tile.afc.ownerId !== playerId) continue;
    for (const techId of tile.afc.modules ?? []) installed.add(techId);
  }
  return installed;
}

/** True when techId lets this player build: an installed module, or a researched non-module tech. */
export const canBuildWithTech = (researched: ReadonlySet<string>, installedModules: ReadonlySet<string>, techId: string): boolean =>
  isAfcModuleTech(techId) ? installedModules.has(techId) : researched.has(techId);

/** What a cast handler context offers for the module lookup; ownedAfcTileKeys narrows the scan. */
export type AbilityAccessContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  ownedAfcTileKeys?: ((playerId: string) => Iterable<string>) | undefined;
};

/**
 * True when the actor may cast the ability: every required tech is researched
 * or, for an AFC module, installed on an active AFC they own. Research is
 * checked first so the usual case never scans tiles.
 */
export function hasAbilityAccess(context: AbilityAccessContext, actor: Pick<DomainPlayer, "id" | "techIds">, id: AbilityId): boolean {
  if (playerHasAbilityTech(actor.techIds, id)) return true;
  return playerHasAbilityTech(actor.techIds, id, installedAfcModuleTechIds(actor.id, context.tiles, context.ownedAfcTileKeys?.(actor.id)));
}
