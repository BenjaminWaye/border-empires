import type { Tile, TileOverviewLine } from "../client-types.js";
import type { TechInfo } from "../client-tech-info-types.js";
import { formatCooldownShort } from "../client-app-runtime-utils.js";

// The 4 player-facing Manifest branches AFC-Module techs can belong to
// (docs/manifest-full-plan.md §4: "Economy, Manpower, and War modules are
// distinct AFC attachments") -- Aether modules are the 4th, added by §6's
// own table. Displayed in this fixed order regardless of docking order, so
// the panel reads the same way every time.
const MODULE_FAMILY_ORDER: ReadonlyArray<{ branch: string; label: string }> = [
  { branch: "economy", label: "Economy" },
  { branch: "manpower", label: "Manpower" },
  { branch: "war", label: "War" },
  { branch: "aether", label: "Aether" }
];

/**
 * Tile-overview lines for an AFC's docked Modules, grouped by their
 * Manifest branch (TechInfo.branch already carries the Economy/Manpower/
 * War/Aether split per module tech -- verified against every AFC-Module
 * tech in tech-tree.json matching docs/manifest-full-plan.md §6's table,
 * so no separate mapping table is needed here). Lists every commissioned
 * module regardless of whether it has 3D/2D map art yet -- unlike the map
 * renderers, this panel has no physical-socket cap to respect.
 * Empty for tiles without an AFC.
 */
export const afcModuleOverviewLines = (tile: Tile, techCatalog: readonly TechInfo[], nowMs: number = Date.now()): TileOverviewLine[] => {
  const afc = tile.afc;
  if (!afc) return [];
  const lines: TileOverviewLine[] = [{ html: "AFC Modules", kind: "section" }];
  if (afc.status === "inactive") {
    lines.push({ html: `<span class="tile-overview-dormant">⚠ Dormant — modules inactive until this AFC is reclaimed.</span>` });
  }
  const techById = new Map(techCatalog.map((tech) => [tech.id, tech]));
  const incomingLines = (afc.incomingModules ?? []).flatMap((entry): TileOverviewLine[] => {
    const tech = techById.get(entry.techId);
    return tech ? [{ html: `${tech.name} — lands in ${formatCooldownShort(entry.arrivesAt - nowMs)}`, nested: true }] : [];
  });
  if (incomingLines.length > 0) lines.push({ html: "Incoming", kind: "group" }, ...incomingLines);
  const moduleTechIds = afc.modules ?? [];
  if (moduleTechIds.length === 0) {
    if (incomingLines.length === 0) lines.push({ html: "No modules commissioned yet." });
    return lines;
  }
  const namesByBranch = new Map<string, string[]>();
  const unrecognized: string[] = [];
  for (const techId of moduleTechIds) {
    const tech = techById.get(techId);
    // A docked tech id the client's catalog doesn't recognize shouldn't
    // happen, but the array's shape doesn't statically guarantee it --
    // skip rather than throw, matching createAfcOverlayGroup's own
    // "unknown tech id docks nothing" precedent (client-map-3d-afc-module-family.ts).
    if (!tech) continue;
    const family = MODULE_FAMILY_ORDER.find((f) => f.branch === tech.branch);
    if (family) namesByBranch.set(family.branch, [...(namesByBranch.get(family.branch) ?? []), tech.name]);
    else unrecognized.push(tech.name);
  }
  for (const family of MODULE_FAMILY_ORDER) {
    const names = namesByBranch.get(family.branch);
    if (!names || names.length === 0) continue;
    lines.push({ html: family.label, kind: "group" });
    for (const name of names) lines.push({ html: name, nested: true });
  }
  if (unrecognized.length > 0) {
    lines.push({ html: "Other", kind: "group" });
    for (const name of unrecognized) lines.push({ html: name, nested: true });
  }
  return lines;
};
