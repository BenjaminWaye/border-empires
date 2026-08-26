// Shared types + value-formatting helpers for the structure modifier
// catalog (structure-modifier-catalog.ts). Split out so the catalog files
// themselves can stay focused on the per-building data.
//
// game-domain must not depend on client-only types, so ModifierTileContext
// is a minimal, self-contained shape carrying only the live fields the
// catalog actually needs (not the client's full Tile type).
import type { ConverterMode, EconomicStructureType, FortVariant, SiegeOutpostVariant } from "@border-empires/shared";

export type ModifierStructureType =
  | EconomicStructureType
  | "FORT"
  | "TITANIUM_BASTION"
  | "THUNDER_BASTION"
  | "SIEGE_OUTPOST"
  | "SIEGE_TOWER"
  | "DREAD_TOWER"
  | "OBSERVATORY";

export type StructureModifier = {
  statLabel: string;
  valueText: string;
  // Present for any numeric contribution that's safe to combine across every
  // active copy of this building in a town's support ring, for town-level
  // aggregation (see live-town-summary.ts's townModifierTotals). By default
  // the aggregator multiplies rawValue by the copy count (flat-per-copy
  // numbers like a manpower cap bonus, or a percent-per-copy number like
  // Weapons Workshop's empire attack bonus — see `unit`). Set
  // `alreadyAggregated: true` when rawValue was computed from a live count
  // already (e.g. Mintworks's nonlinear stacking via
  // mintworksGoldProductionMultiplier) so the aggregator uses it as-is
  // instead of multiplying again.
  rawValue?: number;
  // "flat" (default) renders the aggregate as a plain +N; "percent" renders
  // it as a signed percentage.
  unit?: "flat" | "percent";
  alreadyAggregated?: boolean;
  tone: "positive" | "negative" | "neutral";
  // True for support-tile buildings whose effect applies to the whole town
  // rather than just the tile they're built on.
  isTownWide: boolean;
};

export type ModifierTileContext = {
  town?: { mintworksCount?: number; clearingHouseActive?: boolean };
  resource?: string | undefined;
  fortVariant?: FortVariant;
  siegeOutpostVariant?: SiegeOutpostVariant;
  converterMode?: ConverterMode;
};

export type ModifierContext = { tile?: ModifierTileContext };

// One heading ("6 Mintworks") plus every stat total that building type
// contributes, combined across all its active copies in a town's support
// ring (see townModifierTotalsFromCounts in
// structure-modifier-catalog-town-aggregate.ts). Grouped per building type
// — rather than merging every building's totals into flat, unlabeled stat
// buckets — so the tile-overview panel can show which building a number
// actually comes from instead of two differently-scoped lines both reading
// bare "Gold production".
export type TownModifierTotal = {
  heading: string;
  modifiers: Array<{ statLabel: string; valueText: string; tone: "positive" | "negative" | "neutral" }>;
};

export const percentLabel = (value: number): string => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}%`;

export const multiplierPercentLabel = (value: number): string => percentLabel((value - 1) * 100);

export const connectedLabel = (count: number): string => `${count} connected ${count === 1 ? "town" : "towns"}`;
