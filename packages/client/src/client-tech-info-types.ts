// Tech/domain-tree progression types, split out of client-types.ts (already
// over the repo's 500-line soft cap) so this addition doesn't grow that file
// further -- see scripts/check-file-line-limits.mjs. Re-exported from
// client-types.ts so existing importers don't need to change their import
// path.

export type TechInfo = {
  id: string;
  name: string;
  tier: number;
  researchTimeSeconds?: number;
  rootId?: string;
  // Tech-tree redesign: which of the 4 player-facing branches (war, economy,
  // manpower, aether) this tech belongs to.
  branch?: string;
  requires?: string;
  prereqIds?: string[];
  description: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  effects?: Record<string, unknown>;
  requirements: {
    gold: number;
    resources: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
  grantsPowerup?: { id: string; charges: number };
  // Set only for a monument's unlock tech once someone's assembly of that
  // monument stands (season-unique — monument-uniqueness.ts, apps/simulation)
  // and this player doesn't already own the tech. Explains why it can't be
  // researched even though it would otherwise be reachable.
  lockedReason?: string;
};

export type DomainInfo = {
  id: string;
  tier: number;
  name: string;
  description: string;
  requiresTechId: string;
  mods: Partial<Record<"attack" | "defense" | "income" | "vision", number>>;
  effects?: Record<string, unknown>;
  requirements: {
    gold: number;
    resources: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
    checklist?: Array<{ label: string; met: boolean }>;
    canResearch?: boolean;
  };
};

export type PendingResearch = {
  techId: string;
  startedAt: number;
  completesAt: number;
};
