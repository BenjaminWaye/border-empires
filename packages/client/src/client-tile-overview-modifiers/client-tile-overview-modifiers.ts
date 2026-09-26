import { HILLS_VISION_BONUS, WAYSTATION_POP_BURST, isHillsTileAt, NATURAL_WONDER_LABELS, converterModeOf, type EconomicStructureType } from "@border-empires/shared";
import { structureModifiersFor, type ModifierStructureType, type StructureModifier } from "@border-empires/game-domain";
import type { Tile } from "../client-types.js";
import type { TileOverviewLine } from "../client-tile-menu-types.js";
import { economicStructureName, type StructureInfoKey } from "../client-map-display.js";
import { structureKeyForTile } from "../client-tile-menu-view/client-tile-menu-structure-label.js";

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
// their catalog label — sourced from STRUCTURE_DISPLAY_NAMES (client-structure-display-names.ts),
// the single canonical name map, rather than a second hardcoded copy.
const SUPPORT_STRUCTURE_LABELS: Partial<Record<ModifierStructureType, string>> = {
  SEED_GRANARY: economicStructureName("SEED_GRANARY"),
  GRANARY: economicStructureName("GRANARY"),
  CLEARING_HOUSE: economicStructureName("CLEARING_HOUSE")
};

const activeSupportStructureModifiers = (tile: NonNullable<Tile["town"]>): TileOverviewModifier[] => {
  const modifiers: TileOverviewModifier[] = [];
  // Mintworks gold production used to be recomputed here from
  // tile.mintworksCount AND separately as part of the town's
  // townModifierTotals (menuOverviewForTile, client-tile-menu-view.ts) —
  // both fed off the same live count, so the town-center tile always showed
  // two "Gold production" lines side by side. townModifierTotals is the
  // single source of truth for town-wide aggregates now; don't duplicate it.
  // A plain Granary (Incubation Engine) grants its instant one-time
  // population burst on completion PLUS a flat ongoing growth-rate
  // multiplier (GRANARY_ONGOING_GROWTH_MULT, reintroduced 2026-08-26 —
  // see granaryGrowthMultiplier's doc comment in game-domain for the
  // commit 7a51b06b "double-dip" history this revises). A Seed Granary's
  // buffed-radius bonus stacks multiplicatively on top of that base when
  // it applies, matching granaryGrowthMultiplier's server-side formula.
  if (tile.hasSeedGranary && tile.seedGranaryActive) {
    modifiers.push(...toTileOverviewModifiers(SUPPORT_STRUCTURE_LABELS.SEED_GRANARY!, structureModifiersFor("SEED_GRANARY").filter((m) => m.statLabel === "Population growth")));
  } else if (tile.hasGranary && tile.granaryActive && tile.seedGranaryBuffed) {
    modifiers.push({ reason: `${SUPPORT_STRUCTURE_LABELS.GRANARY} (Seed Granary boost)`, effect: "+43% population growth", tone: "positive" });
  } else if (tile.hasGranary && tile.granaryActive) {
    modifiers.push(...toTileOverviewModifiers(SUPPORT_STRUCTURE_LABELS.GRANARY!, structureModifiersFor("GRANARY").filter((m) => m.statLabel === "Population growth")));
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
  const modifiers = structureModifiersFor(tile.type as ModifierStructureType, { tile: { converterMode: converterModeOf(tile) } }).filter((m) => m.statLabel !== redundantLabel);
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
    if ((tile.town.arsenalFactoryCount ?? 0) > 0) {
      modifiers.push({ reason: "Arsenal District", effect: `+${Math.round(((tile.town.arsenalMultiplier ?? 1) - 1) * 100)}% (${(tile.town.arsenalMultiplier ?? 1).toFixed(2)}×)`, tone: "positive" });
      if (tile.town.arsenalTitaniumFactoryCount || tile.town.arsenalUmbriteFactoryCount) {
        modifiers.push({ reason: "Arsenal factories", effect: `${tile.town.arsenalTitaniumFactoryCount ?? 0} Titanium · ${tile.town.arsenalUmbriteFactoryCount ?? 0} Umbrite`, tone: "neutral" });
      }
      const nextArsenalMultiplier = tile.town.arsenalNextMultiplier ?? tile.town.arsenalMultiplier ?? 1;
      modifiers.push({ reason: "Next Weapons Factory", effect: `+${Math.round((nextArsenalMultiplier - 1) * 100)}% (${nextArsenalMultiplier.toFixed(2)}×)`, tone: "neutral" });
      modifiers.push({ reason: "Arsenal maximum", effect: "+125% (2.25×)", tone: "neutral" });
    }
    // Mercantile Charter (and any future firstThreeTowns* domain/tech): this
    // town is one of the owner's first three, so its gold/growth already
    // carries the bonus (folded into goldPerMinute/populationGrowthPerMinute
    // upstream) — surface it here so the player can see why, instead of the
    // boost applying invisibly.
    if (tile.town.firstThreeTownGoldMult && tile.town.firstThreeTownGoldMult !== 1) {
      modifiers.push({
        reason: "Mercantile Charter",
        effect: `${percentLabel((tile.town.firstThreeTownGoldMult - 1) * 100)} gold production`,
        tone: tile.town.firstThreeTownGoldMult > 1 ? "positive" : "negative"
      });
    }
    if (tile.town.firstThreeTownPopGrowthMult && tile.town.firstThreeTownPopGrowthMult !== 1) {
      modifiers.push({
        reason: "Mercantile Charter",
        effect: `${percentLabel((tile.town.firstThreeTownPopGrowthMult - 1) * 100)} population growth`,
        tone: tile.town.firstThreeTownPopGrowthMult > 1 ? "positive" : "negative"
      });
    }
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
    const label = variant === "DREAD_TOWER" ? "Dread Tower" : variant === "SIEGE_TOWER" ? "Siege Tower" : "Siege Battery";
    modifiers.push(...toTileOverviewModifiers(label, structureModifiersFor(variant)));
  }
  if (tile.observatory?.status === "active") {
    modifiers.push(...toTileOverviewModifiers("Aether Tower", structureModifiersFor("OBSERVATORY")));
  }
  if (tile.economicStructure?.status === "active" && tile.economicStructure.type === "MINE") {
    modifiers.push(...toTileOverviewModifiers("Mine", structureModifiersFor("MINE", { tile: { resource: tile.resource } })));
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

const effectLine = (name: string, mod: string, tone: "positive" | "neutral"): TileOverviewLine => ({
  kind: "effect",
  html: `<span class="tile-overview-effect-name">${name}:</span><span class="tile-overview-effect-mod is-${tone}">${mod}</span>`
});

/**
 * Tile-overview block for a waystation site: a "Waystation" section with a
 * Status row (Dormant until a player expands onto it, then Active for good --
 * it grants ONE permanent effect and is never consumed, so "depleted" would
 * be misleading), plus what it does / what it granted. Empty for tiles
 * without a waystation.
 */
export const waystationOverviewLines = (
  tile: Tile,
  deps: { me: string; prettyToken: (value: string) => string; techName?: (techId: string) => string | undefined }
): TileOverviewLine[] => {
  const waystation = tile.waystation;
  if (!waystation) return [];
  const lines: TileOverviewLine[] = [{ html: "Waystation", kind: "section" }];
  if (!waystation.activated) {
    lines.push(effectLine("Status", "Dormant", "neutral"));
    if (tile.ownerId !== deps.me) lines.push({ html: "Claim or capture this tile to activate it. It grants one random permanent bonus: vision, a population burst in a nearby town, a free tech, or +1 resource slot." });
    return lines;
  }
  lines.push(effectLine("Status", "Active", "positive"));
  const effect = grantedEffectLabel(waystation, deps);
  if (effect) lines.push(effectLine("Granted", effect, "positive"));
  if (waystation.activatedByPlayerId) lines.push(effectLine("Activated by", waystation.activatedByPlayerId === deps.me ? "You" : "Another player", "neutral"));
  return lines;
};

const grantedEffectLabel = (
  waystation: NonNullable<Tile["waystation"]>,
  deps: { prettyToken: (value: string) => string; techName?: (techId: string) => string | undefined }
): string | undefined => {
  switch (waystation.grantedEffect) {
    case "VISION":
      return waystation.revealedAtX !== undefined && waystation.revealedAtY !== undefined
        ? `Vision (revealed area around ${waystation.revealedAtX}, ${waystation.revealedAtY})`
        : "Vision";
    case "POPULATION":
      return `+${WAYSTATION_POP_BURST.toLocaleString()} population${waystation.grantedTownName ? ` in ${waystation.grantedTownName}` : ""}`;
    case "TECH":
      return waystation.grantedTechId ? `Unlocked ${deps.techName?.(waystation.grantedTechId) ?? deps.prettyToken(waystation.grantedTechId)}` : undefined;
    case "RESOURCE_SLOT":
      return waystation.grantedResource ? `+1 ${deps.prettyToken(waystation.grantedResource)} resource slot` : undefined;
    default:
      return undefined;
  }
};

/**
 * The "what is this tile?" lead of the overview: the special thing on it
 * (structure, waystation, natural wonder, shard site) goes first, ahead of the
 * generic ownership boilerplate ("Frontier land is visible control...") and the
 * economy rows, so the most distinctive fact is the first thing a player reads.
 * Land tiles only; empty when the tile is plain.
 */
export const tileFeatureLeadLines = (
  tile: Tile,
  ownerKind: TileOwnerKind,
  deps: { me: string; prettyToken: (value: string) => string; structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string }
): TileOverviewLine[] => {
  const lines: TileOverviewLine[] = [];
  const structureKey = structureKeyForTile(tile);
  if (structureKey) lines.push({ html: `Built: ${deps.structureInfoButtonHtml(structureKey)}` });
  lines.push(...waystationOverviewLines(tile, deps));
  const wonderLine = naturalWonderOverviewLine(tile, ownerKind);
  if (wonderLine) lines.push({ html: wonderLine });
  if (tile.shardSite) {
    const n = tile.shardSite.amount;
    const shards = `${n} shard${n === 1 ? "" : "s"}`;
    lines.push({ html: tile.shardSite.kind === "FALL" ? `Shard rain deposit: ${shards} can be collected here for a short time.` : `Shard cache: ${shards} can be recovered here.` });
  }
  return lines;
};
