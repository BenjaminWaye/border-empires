// Single source of truth for turning "how many active copies of each
// support-tile building sit in this town's support ring" into the town's
// combined Modifier totals (e.g. 3 Garrison Halls -> "Manpower cap: +450").
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
import { structureModifiersFor } from "./structure-modifier-catalog-core.js";
import { percentLabel, type ModifierStructureType, type TownModifierTotal } from "./structure-modifier-catalog-types.js";

// Buildings without a numeric rawValue (Census Hall scaling off connected
// Incubation Engines, Customs House off connected docks, Rail Depot/Assembly
// Works off other network buildings, one-time bursts, etc.) are
// intentionally left out — their effect doesn't reduce to "count x a
// constant for this town alone", so summing them here would just be wrong,
// not just incomplete.
export const TOWN_MODIFIER_AGGREGATE_TYPES: readonly ModifierStructureType[] = [
  "GARRISON_HALL", "LOGISTICS_GUILD", "MINTWORKS",
  "WEAPONS_WORKSHOP", "TITANIUM_WEAPONS_FACTORY", "UMBRITE_WEAPONS_FACTORY"
];

export const townModifierTotalsFromCounts = (
  countsByType: Partial<Record<ModifierStructureType, number>>,
  ctx: { clearingHouseActive?: boolean } = {}
): TownModifierTotal[] => {
  const buckets = new Map<string, { total: number; tone: "positive" | "negative" | "neutral"; unit: "flat" | "percent" }>();
  for (const type of TOWN_MODIFIER_AGGREGATE_TYPES) {
    const count = countsByType[type] ?? 0;
    if (count <= 0) continue;
    // Mintworks stacking is nonlinear (each copy is worth more with an
    // active Clearing House) — structureModifiersFor computes the real
    // already-aggregated total from the live count when given this
    // context, rather than a naive per-copy multiply.
    const modifierCtx = type === "MINTWORKS"
      ? { tile: { town: { mintworksCount: count, clearingHouseActive: Boolean(ctx.clearingHouseActive) } } }
      : {};
    for (const modifier of structureModifiersFor(type, modifierCtx)) {
      if (!modifier.isTownWide || typeof modifier.rawValue !== "number") continue;
      const contribution = modifier.alreadyAggregated ? modifier.rawValue : modifier.rawValue * count;
      const existing = buckets.get(modifier.statLabel);
      buckets.set(modifier.statLabel, {
        total: Number(((existing?.total ?? 0) + contribution).toFixed(4)),
        tone: modifier.tone,
        unit: modifier.unit ?? "flat"
      });
    }
  }
  return [...buckets.entries()].map(([statLabel, bucket]) => ({
    statLabel,
    total: bucket.total,
    valueText: bucket.unit === "percent" ? percentLabel(bucket.total) : `+${bucket.total}`,
    tone: bucket.tone
  }));
};
