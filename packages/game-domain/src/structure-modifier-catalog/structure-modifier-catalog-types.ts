// Shared types + value-formatting helpers for the structure modifier
// catalog (structure-modifier-catalog.ts). Split out so the catalog files
// themselves can stay focused on the per-building data.
//
// game-domain must not depend on client-only types, so ModifierTileContext
// is a minimal, self-contained shape carrying only the live fields the
// catalog actually needs (not the client's full Tile type).
import type { EconomicStructureType, FortVariant, SiegeOutpostVariant } from "@border-empires/shared";

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
  // Present only for flat, additive-per-copy numbers (e.g. a manpower cap
  // bonus) that are safe to multiply by a count of copies for town-level
  // aggregation (see live-town-summary.ts's townModifierTotals). Percent/
  // multiplier-based effects (Mintworks stacking, etc.) intentionally omit
  // this — they already have their own stacking math and must not be
  // double-summed.
  rawValue?: number;
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
};

export type ModifierContext = { tile?: ModifierTileContext };

export const percentLabel = (value: number): string => `${value >= 0 ? "+" : "-"}${Math.abs(Math.round(value))}%`;

export const multiplierPercentLabel = (value: number): string => percentLabel((value - 1) * 100);

export const connectedLabel = (count: number): string => `${count} connected ${count === 1 ? "town" : "towns"}`;
