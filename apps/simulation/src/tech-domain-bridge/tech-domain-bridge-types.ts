import type { DomainPlayer } from "@border-empires/game-domain";

// Extracted from tech-domain-bridge.ts (500-line source budget, see
// AGENTS.md) to make room for new tech-catalog metadata without growing
// that file further.

export type StatMods = NonNullable<DomainPlayer["mods"]>;
type ModKey = keyof StatMods;

export type ModBreakdown = Record<ModKey, Array<{ label: string; mult: number }>>;

// Manifest category (docs/manifest-full-plan.md §3): which of the four
// Coin-purchase categories this tech's Manifest belongs to. AFC_MODULE
// techs auto-dock to the player's home AFC on research completion (see
// afc-module-commissioning.ts) -- the other three categories have no
// physical AFC attachment.
export type ManifestCategory = "AFC_MODULE" | "CREW_OFFICE_CONSIGNMENT" | "CHARTER_WARRANT" | "DOSSIER";

export type TechCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  researchTimeSeconds?: number;
  rootId?: string;
  // Tech-tree redesign: which of the 4 player-facing branches (war, economy,
  // manpower, aether) this tech belongs to -- surfaced to the client for the
  // branch-tag UI requirement.
  branch?: string;
  prereqIds?: string[];
  effects?: Record<string, unknown>;
  mods?: Partial<StatMods>;
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>;
  grantsPowerup?: { id: string; charges: number };
  manifestCategory?: ManifestCategory;
};

export type DomainCatalogEntry = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  effects?: Record<string, unknown>;
  mods?: Partial<StatMods>;
  cost?: Partial<Record<"gold" | "food" | "iron" | "crystal" | "supply" | "shard", number>>;
};
