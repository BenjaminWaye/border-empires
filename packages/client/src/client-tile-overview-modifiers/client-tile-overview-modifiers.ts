import { NATURAL_WONDER_LABELS } from "@border-empires/shared";
import { structureModifiersFor, type ModifierStructureType, type StructureModifier } from "@border-empires/game-domain";
import type { Tile } from "../client-types.js";

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
  MINTWORKS: "Mintworks",
  SEED_GRANARY: "Seed Granary",
  GRANARY: "Granary",
  CLEARING_HOUSE: "Clearing House"
};

const activeSupportStructureModifiers = (tile: NonNullable<Tile["town"]>): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  const mintworksCount = tile.mintworksCount ?? 0;
  if (mintworksCount > 0 && tile.mintworksActive) {
    const stackedGoldProduction = structureModifiersFor("MINTWORKS", {
      tile: { town: { mintworksCount, clearingHouseActive: Boolean(tile.clearingHouseActive) } }
    }).filter((m) => m.statLabel === "Gold production");
    modifiers.push(...toTileOverviewModifiers(SUPPORT_STRUCTURE_LABELS.MINTWORKS!, stackedGoldProduction));
    modifiers.push({ reason: "Mintworks", effect: "higher production raises gold cap", tone: "positive" });
  }
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

const economicStructureModifiersForTile = (tile: NonNullable<Tile["economicStructure"]>): TileOverviewModifier[] => {
  const supportedTypes: ReadonlySet<string> = new Set(["FARMSTEAD", "WATERWORKS", "UMBRITE_RIG", "WOODEN_FORT", "RELAY_BEACON", "CARAVANARY", "CUSTOMS_HOUSE", "RAIL_DEPOT"]);
  if (!supportedTypes.has(tile.type)) return [];
  const labels: Partial<Record<string, string>> = {
    FARMSTEAD: "Farmstead (farm food only)",
    WATERWORKS: "Waterworks (radius support)",
    UMBRITE_RIG: "Umbrite Rig",
    WOODEN_FORT: "Palisade",
    RELAY_BEACON: "Relay Beacon",
    CARAVANARY: "Caravanary",
    CUSTOMS_HOUSE: "Harbor Exchange",
    RAIL_DEPOT: "Rail Depot"
  };
  return toTileOverviewModifiers(labels[tile.type] ?? tile.type, structureModifiersFor(tile.type as ModifierStructureType));
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
    if (tile.town.populationTier !== "SETTLEMENT" && tile.town.connectedTownCount > 0 && tile.town.connectedTownBonus !== 0) {
      modifiers.push({
        reason: connectedLabel(tile.town.connectedTownCount),
        effect: `${percentLabel(tile.town.connectedTownBonus * 100)} gold production`,
        tone: tile.town.connectedTownBonus > 0 ? "positive" : "negative"
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
  if (tile.economicStructure?.status === "active" && tile.economicStructure.type === "MINE") {
    modifiers.push(...toTileOverviewModifiers("Mine", structureModifiersFor("MINE", { tile: { resource: tile.resource } }).filter((m) => m.statLabel === "Production")));
  }
  if (tile.economicStructure?.status === "active") modifiers.push(...economicStructureModifiersForTile(tile.economicStructure));

  return modifiers;
};
