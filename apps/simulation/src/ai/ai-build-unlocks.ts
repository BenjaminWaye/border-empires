import type { DomainTileState } from "@border-empires/game-domain";
import { techEntryById } from "../tech-domain-bridge/tech-domain-bridge.js";

export function activeAfcModuleTechIds(playerId: string, afcKeys: Iterable<string>, tiles: ReadonlyMap<string, DomainTileState>): string[] {
  const installed = new Set<string>();
  for (const key of afcKeys) {
    const tile = tiles.get(key);
    if (tile?.ownerId !== playerId || tile.ownershipState !== "SETTLED" || tile.afc?.status !== "active" || tile.afc.ownerId !== playerId) continue;
    for (const techId of tile.afc.modules ?? []) installed.add(techId);
  }
  return [...installed];
}

export function hasInstalledAiBuildModule(installed: readonly string[] | undefined, techId: string | undefined): boolean {
  return !techId || installed === undefined || techEntryById.get(techId)?.manifestCategory !== "AFC_MODULE" || installed.includes(techId);
}
