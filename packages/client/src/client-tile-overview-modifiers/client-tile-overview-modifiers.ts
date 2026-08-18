import { HILLS_VISION_BONUS, isHillsTileAt, NATURAL_WONDER_LABELS, type EconomicStructureType } from "@border-empires/shared";
import { structureModifiersFor, type ModifierStructureType, type StructureModifier } from "@border-empires/game-domain";
import type { Tile } from "../client-types.js";
import { economicStructureName } from "../client-map-display.js";

type TileOwnerKind = "unclaimed" | "mine-frontier" | "mine-settled" | "ally" | "enemy";

// Boon is live once this tile is SETTLED under the viewer (mirrors
// settledTilesForPlayer/refreshPlayerWonders server-side) — ownership alone
// (FRONTIER) doesn't activate it yet, and claimedAt is unrelated (a one-time
// Conscription Engine latch, not a general activation flag).
export const naturalWonderOverviewLine = (tile: Tile, ownerKind: TileOwnerKind): string | undefined => {
  if (!tile.naturalWonder) return undefined;
  const { name, boon } = NATURAL_WONDER_LABELS[tile.naturalWonder.type];
  if (ownerKind === "mine-settled") return `Natural wonder: ${name} — active. Boon: ${boon}.`;
  if (ownerKind === "mine-frontier") return `Natural wonder: ${name}. Settle this tile to activate: ${boon}.`;
  return `Natural wonder: ${name}. Boon: ${boon}.`;
};

export type TileOverviewModifier = {
  reason: string;
  effect: string;
  tone: "positive" | "negative" | "neutral";
};

const percentLabel = (value: number): string => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}%`;

const connectedLabel = (count: number): string => `${count} connected ${count === 1 ? "town" : "towns"}`;

// Unified "label: value" style (white stat name, colored value) — every
// modifier line uses the catalog's own stat name (statLabel) as the label,
// same as the multi-modifier and town-aggregate lines. `structureLabel`
// (the building's display name) only gets folded in as a prefix when a
// single building contributes more than one modifier line, to disambiguate
// which line belongs to which stat.
const toTileOverviewModifiers = (structureLabel: string, modifiers: StructureModifier[]): TileOverviewModifier[] =>
  modifiers.map((m) => ({
    reason: modifiers.length > 1 ? `${structureLabel} — ${m.statLabel}` : m.statLabel,
    effect: m.valueText,
    tone: m.tone
  }));

const hasActiveTownCaptureShock = (tile: Tile, nowMs = Date.now()): boolean =>
  typeof tile.town?.captureShockUntil === "number" && tile.town.captureShockUntil > nowMs;

// Town support-ring buildings whose modal/tile display name differs from
// their catalog label — kept as a small lookup rather than baking display
// names into the catalog (game-domain has no notion of UI copy).
const SUPPORT_STRUCTURE_LABELS: Partial<Record<ModifierStructureType, string>> = {
  SEED_GRANARY: "Seed Granary",
  GRANARY: "Granary",
  CLEARING_HOUSE: "Clearing House"
};

const activeSupportStructureModifiers = (tile: NonNullable<Tile["town"]>): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  // Mintworks gold production used to be recomputed here from
  // tile.mintworksCount AND separately as part of the town's
  // townModifierTotals (menuOverviewForTile, client-tile-menu-view.ts) —
  // both fed off the same live count, so the town-center tile always showed
  // two "Gold production" lines side by side. townModifierTotals is the
  // single source of truth for town-wide aggregates now; don't duplicate it.
  // A plain Granary (Incubation Engine) grants ONLY its instant one-time
  // population burst on completion — the old ongoing +15% growth bonus was
  // removed (commit 7a51b06b, "Incubation Engine double-dip" fix). No
  // ongoing-growth line is shown here unless a Seed Granary's buffed radius
  // actually applies (matching granaryGrowthMultiplier's server-side
  // behavior).
  if (tile.hasSeedGranary && tile.seedGranaryActive) {
    modifiers.push(...toTileOverviewModifiers(SUPPORT_STRUCTURE_LABELS.SEED_GRANARY!, structureModifiersFor("SEED_GRANARY").filter((m) => m.statLabel === "Population growth")));
  } else if (tile.hasGranary && tile.granaryActive && tile.seedGranaryBuffed) {
    modifiers.push({ reason: "Granary (Seed Granary boost)", effect: "+30% population growth", tone: "positive" });
  }
  if (tile.hasClearingHouse && tile.clearingHouseActive) {
    modifiers.push(...toTileOverviewModifiers(SUPPORT_STRUCTURE_LABELS.CLEARING_HOUSE!, structureModifiersFor("CLEARING_HOUSE")));
  }
  return modifiers;
};

// Covers EVERY EconomicStructureType via the shared catalog — MINE is
// excluded because it's handled separately above with resource-aware
// filtering, and everything else (previously a small hardcoded allowlist of
// 8 types left over from before the catalog existed) now falls through to
// structureModifiersFor generically. Monument-component types correctly
// return [] from the catalog (no numeric effect of their own), so nothing
// renders for them here — that's intended, not a gap.
const FARM_RESOURCE_LABEL_OVERRIDES: Partial<Record<string, string>> = {
  FARMSTEAD: "Farmstead (farm food only)",
  WATERWORKS: "Waterworks (radius support)"
};

// Farmstead's "Farm food" and Waterworks's "Farmstead food (10-tile radius)"
// lines duplicate the same static build-menu copy (client-map-display.ts)
// with no new information — they never reflect the tile's actual boosted
// output, so they're excluded here rather than repeated as a "modifier".
const REDUNDANT_STATIC_STAT_LABELS_BY_TYPE: Partial<Record<string, string>> = {
  FARMSTEAD: "Farm food",
  WATERWORKS: "Farmstead food (10-tile radius)"
};

const economicStructureModifiersForTile = (tile: NonNullable<Tile["economicStructure"]>): TileOverviewModifier[] => {
  if (tile.type === "MINE") return [];
  const label = FARM_RESOURCE_LABEL_OVERRIDES[tile.type] ?? economicStructureName(tile.type as EconomicStructureType);
  const redundantLabel = REDUNDANT_STATIC_STAT_LABELS_BY_TYPE[tile.type];
  const modifiers = structureModifiersFor(tile.type as ModifierStructureType).filter((m) => m.statLabel !== redundantLabel);
  return toTileOverviewModifiers(label, modifiers);
};

export const tileOverviewModifiersForTile = (tile: Tile): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  const nowMs = Date.now();

  if (tile.town) {
    const inCaptureShock = hasActiveTownCaptureShock(tile, nowMs);
    if (inCaptureShock) {
      modifiers.push({
        reason: "Recently captured",
        effect: tile.ownershipState === "SETTLED" ? "population growth paused" : "town manpower and production paused until settled",
        tone: "negative"
      });
    }
    if (tile.town.populationTier !== "SETTLEMENT" && tile.town.connectedTownCount > 0) {
      // connectedTownBonus is 0 whenever no town in this network has a
      // built Caravanary yet (networkHasCaravanary gate,
      // apps/simulation/src/economy-network/economy-network.ts) — the
      // network still exists (connectedTownCount > 0) but pays nothing.
      // Surfacing that as its own neutral line, instead of staying silent,
      // is the whole point: a 0% row here is the answer to "why isn't my
      // connected-town bonus doing anything."
      modifiers.push(
        tile.town.connectedTownBonus !== 0
          ? {
              reason: connectedLabel(tile.town.connectedTownCount),
              effect: `${percentLabel(tile.town.connectedTownBonus * 100)} gold production`,
              tone: tile.town.connectedTownBonus > 0 ? "positive" : "negative"
            }
          : {
              reason: connectedLabel(tile.town.connectedTownCount),
              effect: "+0% gold production — build a Trade Nexus to enable",
              tone: "neutral"
            }
      );
    }
    // Support ring below full strength directly scales down town gold
    // production (supportRatio multiplier, apps/simulation/src/
    // live-town-summary.ts) — real and worth naming, not cosmetic.
    if (
      tile.town.populationTier !== "SETTLEMENT" &&
      Number.isFinite(tile.town.supportMax) &&
      tile.town.supportMax > 0 &&
      Number.isFinite(tile.town.supportCurrent) &&
      tile.town.supportCurrent < tile.town.supportMax
    ) {
      const supportRatio = tile.town.supportCurrent / tile.town.supportMax;
      modifiers.push({
        reason: `Support ${tile.town.supportCurrent}/${tile.town.supportMax}`,
        effect: `${percentLabel((supportRatio - 1) * 100)} gold production`,
        tone: "negative"
      });
    }
    for (const growth of tile.town.growthModifiers ?? []) {
      if (inCaptureShock) continue;
      modifiers.push({
        reason: growth.label === "Long time peace" ? "Long-term peace" : growth.label,
        effect: `${growth.label === "Long time peace" ? "+100%" : "-100%"} population growth`,
        tone: growth.deltaPerMinute > 0 ? "positive" : growth.deltaPerMinute < 0 ? "negative" : "neutral"
      });
    }
    modifiers.push(...activeSupportStructureModifiers(tile.town));
  }

  for (const modifier of tile.dock?.modifiers ?? []) {
    modifiers.push({
      reason: modifier.label,
      effect: `${percentLabel(modifier.percent)} gold production`,
      tone: modifier.deltaGoldPerMinute > 0 ? "positive" : modifier.deltaGoldPerMinute < 0 ? "negative" : "neutral"
    });
  }

  if (tile.fort?.status === "active" && (tile.fort.disabledUntil ?? 0) <= nowMs) {
    const variant = tile.fort.variant === "TITANIUM_BASTION" || tile.fort.variant === "THUNDER_BASTION" ? tile.fort.variant : "FORT";
    const label = variant === "THUNDER_BASTION" ? "Thunder Bastion" : variant === "TITANIUM_BASTION" ? "Titanium Bastion" : "Fort";
    modifiers.push(...toTileOverviewModifiers(label, structureModifiersFor(variant)));
  }
  if (tile.siegeOutpost?.status === "active") {
    const variant = tile.siegeOutpost.variant === "SIEGE_TOWER" || tile.siegeOutpost.variant === "DREAD_TOWER" ? tile.siegeOutpost.variant : "SIEGE_OUTPOST";
    const label = variant === "DREAD_TOWER" ? "Dread Tower" : variant === "SIEGE_TOWER" ? "Siege Tower" : "Siege Outpost";
    modifiers.push(...toTileOverviewModifiers(label, structureModifiersFor(variant)));
  }
  if (tile.observatory?.status === "active") {
    modifiers.push(...toTileOverviewModifiers("Observatory", structureModifiersFor("OBSERVATORY")));
  }
  if (tile.economicStructure?.status === "active" && tile.economicStructure.type === "MINE") {
    modifiers.push(...toTileOverviewModifiers("Mine", structureModifiersFor("MINE", { tile: { resource: tile.resource } }).filter((m) => m.statLabel === "Production")));
  }
  if (tile.economicStructure?.status === "active") {
    modifiers.push(...economicStructureModifiersForTile(tile.economicStructure));
  }

  // Hills-ness is a permanent, purely procedural property of the coordinate
  // (isHillsTileAt, mirrored server-side in vision-footprint-table.ts) —
  // not gated on ownership or a built structure, so it's shown for any land
  // tile the same way the natural-wonder line is. Computed last so it can
  // tell whether the tile already has another modifier: with one (e.g. a
  // Relay Beacon's own vision line already showing), "Hills" is named as
  // the source to disambiguate; alone, there's nothing to disambiguate
  // from, so it's shown as a plain "Vision" line instead.
  if (tile.terrain === "LAND" && isHillsTileAt(tile.x, tile.y)) {
    modifiers.push(
      modifiers.length > 0
        ? { reason: "Hills", effect: `vision +${HILLS_VISION_BONUS}`, tone: "positive" }
        : { reason: "Vision", effect: `+${HILLS_VISION_BONUS}`, tone: "positive" }
    );
  }

  return modifiers;
};
