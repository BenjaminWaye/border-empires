import { aetherTowerNextRefillAt, aetherTowerShotsRemaining, type SlotResource } from "@border-empires/shared";
import { formatCooldownShort } from "../client-app-runtime-utils.js";
import type { Tile } from "../client-types.js";
import { dormantStructureLineHtml, type DormancyField } from "./client-tile-menu-dormancy-line.js";

// Extracted out of client-tile-menu-view.ts (500-line file cap, AGENTS.md):
// the tile overview's Aether Tower lines -- the tower's own status, the
// legend for the protection-field glow selecting it turns on
// (client-aether-tower-protection.ts), and, on any tile, which enemy tower
// is shielding it.

export const AETHER_SHIELD_LEGEND_LINE =
  "On the map: tiles glowing <b>blue</b> inside a blue outline are shielded by your or allied Aether Towers; <b>red</b> means an enemy tower's shield. Shielded tiles can't be hit by hostile Aether abilities.";

export type ObservatoryOverviewDeps = {
  readonly me: string;
  readonly nowMs: number;
  // Shots each of the local player's towers holds (aether-tower-shots.ts).
  readonly ownMaxShots: number;
  readonly hostileObservatoryProtectingTile: (tile: Tile) => { readonly x: number; readonly y: number } | undefined;
  readonly dormantResourcesForTile?: ((tile: Tile, field: DormancyField) => SlotResource[] | undefined) | undefined;
  readonly observatoryCrystalSlotCountForTile?: ((tile: Tile) => number) | undefined;
};

/** "Shots: 2 of 3 left · next back in 5h 12m" for one of the local player's towers. */
export const ownTowerShotsLine = (observatory: NonNullable<Tile["observatory"]>, maxShots: number, nowMs: number): string => {
  const remaining = aetherTowerShotsRemaining(observatory, maxShots, nowMs);
  const refillAt = aetherTowerNextRefillAt(observatory, nowMs);
  const refill = refillAt === undefined ? "" : ` · next back in ${formatCooldownShort(refillAt - nowMs)}`;
  return `Shots: ${remaining} of ${maxShots} left${refill}. Each Aether ability cast from this tower spends one; a shot comes back 24h after it was used.`;
};

export const observatoryOverviewLines = (tile: Tile, deps: ObservatoryOverviewDeps): string[] => {
  const lines: string[] = [];
  const shieldedBy = tile.ownerId && tile.ownerId !== deps.me ? deps.hostileObservatoryProtectingTile(tile) : undefined;
  if (shieldedBy) {
    lines.push(`Shielded by an enemy Aether Tower at (${shieldedBy.x}, ${shieldedBy.y}): your Aether abilities can't target this tile until that tower runs out of shots, loses power or falls.`);
  }
  if (!tile.observatory) return lines;
  if (tile.observatory.status === "active" && tile.ownerId === tile.observatory.ownerId) {
    const outOfShots = (tile.observatory.cooldownUntil ?? 0) > deps.nowMs;
    lines.push(outOfShots ? "Aether Tower is active here but out of shots — it is not protecting its owner's nearby tiles from hostile Aether abilities right now." : "Aether Tower is active here and protects its owner's nearby tiles from hostile Aether abilities.");
    if (tile.ownerId === deps.me) lines.push(ownTowerShotsLine(tile.observatory, deps.ownMaxShots, deps.nowMs));
  } else if (tile.observatory.status === "under_construction") {
    lines.push("Aether Tower is under construction on this tile.");
  } else {
    lines.push("Aether Tower is inactive here and currently provides no vision or protection.");
  }
  if (tile.observatory.status === "active") {
    const dormantLine = dormantStructureLineHtml(tile, "observatory", deps.dormantResourcesForTile?.(tile, "observatory"), deps.observatoryCrystalSlotCountForTile?.(tile));
    if (dormantLine) lines.push(dormantLine);
  }
  // Selecting a tower turns the protection-field glow on: say what it means.
  lines.push(AETHER_SHIELD_LEGEND_LINE);
  return lines;
};
