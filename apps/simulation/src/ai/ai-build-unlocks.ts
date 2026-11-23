import type { DomainTileState } from "@border-empires/game-domain";
import { installedAfcModuleTechIds, isAfcModuleTech } from "../afc-module-build-access/afc-module-build-access.js";

export function activeAfcModuleTechIds(playerId: string, afcKeys: Iterable<string>, tiles: ReadonlyMap<string, DomainTileState>): string[] {
  return [...installedAfcModuleTechIds(playerId, tiles, afcKeys)];
}

export function hasInstalledAiBuildModule(installed: readonly string[] | undefined, techId: string | undefined): boolean {
  return !techId || installed === undefined || !isAfcModuleTech(techId) || installed.includes(techId);
}

/**
 * The build handler's tech gate for the AI: a module tech counts once a copy
 * (researched or captured) is installed on an owned active AFC; other techs
 * need research. Without an installed list (older exports) it falls back to research.
 */
export function hasAiBuildTech(techSet: ReadonlySet<string>, installed: readonly string[] | undefined, techId: string | undefined): boolean {
  if (!techId) return true;
  if (installed !== undefined && isAfcModuleTech(techId)) return installed.includes(techId);
  return techSet.has(techId);
}
