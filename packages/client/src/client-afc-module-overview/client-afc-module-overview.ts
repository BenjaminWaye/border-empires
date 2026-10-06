import { AFC_MODULE_BAY_COUNT, afcModuleBaysUsed } from "@border-empires/shared";
import type { Tile, TileOverviewLine } from "../client-types.js";

/**
 * Overview-tab summary of an AFC's module bays. The per-module detail lives
 * in the graphical Modules tab (client-afc-module-bays/), so this is a single
 * "6/8 bays in use · 1 incoming" line plus the dormancy warning.
 * Empty for tiles without an AFC.
 */
export const afcModuleOverviewLines = (tile: Tile): TileOverviewLine[] => {
  const afc = tile.afc;
  if (!afc) return [];
  const lines: TileOverviewLine[] = [{ html: "AFC Modules", kind: "section" }];
  if (afc.status === "inactive") {
    lines.push({ html: `<span class="tile-overview-dormant">⚠ Dormant — modules inactive until this AFC is reclaimed.</span>` });
  }
  const used = Math.min(AFC_MODULE_BAY_COUNT, afcModuleBaysUsed(afc));
  const incoming = afc.incomingModules?.length ?? 0;
  lines.push({ html: `${used}/${AFC_MODULE_BAY_COUNT} bays in use${incoming > 0 ? ` · ${incoming} incoming` : ""} — see the Modules tab.` });
  return lines;
};
