// Single source of truth for turning "how many active copies of each
// support-tile building sit in this town's support ring" into the town's
// combined Modifier totals, grouped per building type (e.g. "3 Garrison
// Halls" -> Manpower cap: +450).
//
// This used to be reimplemented independently in two places —
// apps/simulation/src/live-town-summary.ts (the main live-snapshot path)
// and apps/realtime-gateway/src/tile-detail-snapshot/tile-detail-snapshot.ts
// (the separate REQUEST_TILE_DETAIL path used to serve the tile popup) —
// which is exactly the kind of duplication this whole catalog exists to
// kill. The gateway's copy was never written in the first place, so
// townModifierTotals was computed correctly in the simulation, persisted
// into a redacted townJson that stripped it (toSharedVisibilityTownSummary's
// field allowlist), and then never independently recomputed by the
// tile-detail path — meaning it silently never reached the tile popup for
// any player, including a town's own owner. Centralizing the bucketing math
// here means both callers only need to supply their own locally-derived
// per-type counts; the actual aggregation logic can't drift apart again.
//
// Groups are per BUILDING TYPE, not merged across types that happen to feed
// the same stat name — e.g. Weapons Workshop and Titanium Weapons Factory
// both feed "Empire attack", but each now gets its own "N <Building>"
// heading with its own total rather than one combined, unlabeled number.
// That used to read as ambiguous/duplicated info in the tile overview (two
// "Gold production" lines with different percentages, no indication of
// which building either one came from) — a heading per building fixes that
// at the source instead of leaving the client to guess.
import { structureModifiersFor } from "./structure-modifier-catalog-core.js";
import { percentLabel, type ModifierStructureType, type TownModifierTotal } from "./structure-modifier-catalog-types.js";

// Buildings without a numeric rawValue (Census Hall scaling off connected
// Incubation Engines, Customs House off connected docks, Rail Depot/Assembly
// Works off other network buildings, one-time bursts, etc.) are
// intentionally left out — their effect doesn't reduce to "count x a
// constant for this town alone", so summing them here would just be wrong,
// not just incomplete.
// EXCHANGE-mode converters (Aether Condenser/Titanium Works/Umbrite Works and
// their Advanced tiers) built in a town's support ring: their gold, like
// Mintworks's, is folded into that town's own production instead of paying
// out as separate empire-wide income — see supportedConverterGoldPerMinuteForTown
// (apps/simulation/economy-network.ts) and its wire-shaped counterpart in
// live-town-summary.ts. Unlike every other type here, a plain "active count"
// isn't the right count for these — only EXCHANGE-mode copies earn gold, so
// callers must pass a count that's already filtered to EXCHANGE mode (see
// townModifierTotalsFromCounts's CONVERTER_AGGREGATE_TYPES handling below).
export const CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES: readonly ModifierStructureType[] = [
  "CRYSTAL_SYNTHESIZER", "ADVANCED_CRYSTAL_SYNTHESIZER",
  "TITANIUM_WORKS", "ADVANCED_TITANIUM_WORKS",
  "UMBRITE_SYNTHESIZER", "ADVANCED_UMBRITE_SYNTHESIZER"
];

export const TOWN_MODIFIER_AGGREGATE_TYPES: readonly ModifierStructureType[] = [
  "GARRISON_HALL", "LOGISTICS_GUILD", "MINTWORKS",
  "WEAPONS_WORKSHOP", "TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY",
  ...CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES
];

const TOWN_MODIFIER_AGGREGATE_LABELS: Partial<Record<ModifierStructureType, { singular: string; plural: string }>> = {
  GARRISON_HALL: { singular: "Garrison Hall", plural: "Garrison Halls" },
  LOGISTICS_GUILD: { singular: "Logistics Guild", plural: "Logistics Guilds" },
  MINTWORKS: { singular: "Mintworks", plural: "Mintworks" },
  WEAPONS_WORKSHOP: { singular: "Weapons Workshop", plural: "Weapons Workshops" },
  TITANIUM_WEAPONS_FACTORY: { singular: "Titanium Weapons Factory", plural: "Titanium Weapons Factories" },
  UMBRITE_WEAPONS_FACTORY: { singular: "Umbrite Weapons Factory", plural: "Umbrite Weapons Factories" },
  CRYSTAL_SYNTHESIZER: { singular: "Aether Condenser", plural: "Aether Condensers" },
  ADVANCED_CRYSTAL_SYNTHESIZER: { singular: "Advanced Aether Condenser", plural: "Advanced Aether Condensers" },
  TITANIUM_WORKS: { singular: "Titanium Works", plural: "Titanium Works" },
  ADVANCED_TITANIUM_WORKS: { singular: "Advanced Titanium Works", plural: "Advanced Titanium Works" },
  UMBRITE_SYNTHESIZER: { singular: "Umbrite Works", plural: "Umbrite Works" },
  ADVANCED_UMBRITE_SYNTHESIZER: { singular: "Advanced Umbrite Works", plural: "Advanced Umbrite Works" }
};

export const townModifierTotalsFromCounts = (
  countsByType: Partial<Record<ModifierStructureType, number>>,
  ctx: { clearingHouseActive?: boolean } = {}
): TownModifierTotal[] => {
  const groups: TownModifierTotal[] = [];
  for (const type of TOWN_MODIFIER_AGGREGATE_TYPES) {
    const count = countsByType[type] ?? 0;
    if (count <= 0) continue;
    // Mintworks stacking is nonlinear (each copy is worth more with an
    // active Clearing House) — structureModifiersFor computes the real
    // already-aggregated total from the live count when given this
    // context, rather than a naive per-copy multiply.
    const modifierCtx = type === "MINTWORKS"
      ? { tile: { town: { mintworksCount: count, clearingHouseActive: Boolean(ctx.clearingHouseActive) } } }
      : CONVERTER_TOWN_MODIFIER_AGGREGATE_TYPES.includes(type)
        ? { tile: { converterMode: "EXCHANGE" as const } }
        : {};
    const modifiers: Array<{ statLabel: string; valueText: string; tone: "positive" | "negative" | "neutral" }> = [];
    for (const modifier of structureModifiersFor(type, modifierCtx)) {
      if (!modifier.isTownWide || typeof modifier.rawValue !== "number") continue;
      const total = Number((modifier.alreadyAggregated ? modifier.rawValue : modifier.rawValue * count).toFixed(4));
      modifiers.push({
        statLabel: modifier.statLabel,
        valueText: modifier.unit === "percent" ? percentLabel(total) : `+${total}`,
        tone: modifier.tone
      });
    }
    if (modifiers.length === 0) continue;
    const label = TOWN_MODIFIER_AGGREGATE_LABELS[type] ?? { singular: type, plural: type };
    groups.push({ heading: `${count} ${count === 1 ? label.singular : label.plural}`, modifiers });
  }
  return groups;
};
