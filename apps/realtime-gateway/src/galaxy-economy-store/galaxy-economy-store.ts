// Galactic meta-layer v1 (docs/galactic-campaign-design.md §4/§7): durable
// cross-season economy ledger, keyed by `authUid` (same durable identity as
// galaxy-planet-store) — one balance row per empire, plus one Stability row
// per held territory (Planet or Outpost) keyed by (authUid, seasonId).
//
// A `seasonId` uniquely identifies a territory an authUid holds: each season
// yields exactly one PLANET/OUTPOST/STIPEND outcome per player, so
// (authUid, seasonId) is already a unique territory key without a separate
// synthetic id.
export type GalaxyEconomyBalance = {
  authUid: string;
  // Can go negative — §4's Influence deficit is a real, sustained state, not
  // a clamp-to-zero.
  influence: number;
  // JUDGMENT CALL: floors at 0. The doc gives Influence an explicit deficit
  // mechanic (§4/§7) but never describes a Production debt concept, so
  // Production never goes negative here.
  production: number;
  // Wall-clock time (ms) through which Cycles have been fully applied to
  // this balance. Drives how many whole Cycles have elapsed since the last
  // tick (see galaxy-cycle-scheduler).
  lastCycleAt: number;
};

export type GalaxyTerritoryTier = "PLANET" | "OUTPOST";

export type GalaxyTerritoryStability = {
  authUid: string;
  seasonId: string;
  tier: GalaxyTerritoryTier;
  stability: number;
  // §7/§13: Production invested standing defense. Cancels incoming raid
  // damage 1:1 up to this value (galaxy-fleet-tick.ts) -- "spent, not
  // stored": it is never refunded, and is reset to 0 once the territory's
  // Stability breaks and a Defense Campaign opens for it, since the
  // standing defense was tied to the specific holding that just fell.
  garrison: number;
};

export type GalaxyEconomyStore = {
  getBalance: (authUid: string) => Promise<GalaxyEconomyBalance | undefined>;
  // Every balance row in the store. Used by the Cycle tick scheduler, which
  // must process every empire with a ledger, not just one.
  getAllBalances: () => Promise<GalaxyEconomyBalance[]>;
  upsertBalance: (balance: GalaxyEconomyBalance) => Promise<void>;

  getStability: (authUid: string, seasonId: string) => Promise<GalaxyTerritoryStability | undefined>;
  getStabilityForOwner: (authUid: string) => Promise<GalaxyTerritoryStability[]>;
  // Creates a Stability row at NEW_TERRITORY_STARTING_STABILITY (100) if one
  // doesn't already exist for this (authUid, seasonId); returns the
  // (possibly pre-existing) row either way. Idempotent, so it's safe to call
  // on every request that surfaces a held territory.
  ensureStability: (input: { authUid: string; seasonId: string; tier: GalaxyTerritoryTier }) => Promise<GalaxyTerritoryStability>;
  setStability: (authUid: string, seasonId: string, stability: number) => Promise<void>;
  // Adds `delta` Production to a territory's standing Garrison (a no-op if
  // the territory was never ensured, matching setStability's own
  // never-ensured behavior). Additive rather than a setter since investing
  // Garrison Production is meant to accumulate across multiple deposits.
  addGarrison: (authUid: string, seasonId: string, delta: number) => Promise<void>;
  // Resets Garrison to 0 -- called once a territory's Stability breaks and
  // a Defense Campaign opens for it (§7: Garrison Production has no
  // surrender value).
  resetGarrison: (authUid: string, seasonId: string) => Promise<void>;
};

export class InMemoryGalaxyEconomyStore implements GalaxyEconomyStore {
  private readonly balances = new Map<string, GalaxyEconomyBalance>();
  private readonly stability = new Map<string, GalaxyTerritoryStability>();

  async getBalance(authUid: string): Promise<GalaxyEconomyBalance | undefined> {
    const existing = this.balances.get(authUid);
    return existing ? { ...existing } : undefined;
  }

  async getAllBalances(): Promise<GalaxyEconomyBalance[]> {
    return [...this.balances.values()].map((b) => ({ ...b }));
  }

  async upsertBalance(balance: GalaxyEconomyBalance): Promise<void> {
    this.balances.set(balance.authUid, { ...balance });
  }

  private stabilityKey(authUid: string, seasonId: string): string {
    return `${authUid}::${seasonId}`;
  }

  async getStability(authUid: string, seasonId: string): Promise<GalaxyTerritoryStability | undefined> {
    const existing = this.stability.get(this.stabilityKey(authUid, seasonId));
    return existing ? { ...existing } : undefined;
  }

  async getStabilityForOwner(authUid: string): Promise<GalaxyTerritoryStability[]> {
    const owned: GalaxyTerritoryStability[] = [];
    for (const record of this.stability.values()) {
      if (record.authUid === authUid) owned.push({ ...record });
    }
    return owned;
  }

  async ensureStability(input: { authUid: string; seasonId: string; tier: GalaxyTerritoryTier }): Promise<GalaxyTerritoryStability> {
    const key = this.stabilityKey(input.authUid, input.seasonId);
    const existing = this.stability.get(key);
    if (existing) return { ...existing };
    const record: GalaxyTerritoryStability = { authUid: input.authUid, seasonId: input.seasonId, tier: input.tier, stability: 100, garrison: 0 };
    this.stability.set(key, record);
    return { ...record };
  }

  async setStability(authUid: string, seasonId: string, stability: number): Promise<void> {
    const key = this.stabilityKey(authUid, seasonId);
    const existing = this.stability.get(key);
    if (!existing) return;
    this.stability.set(key, { ...existing, stability });
  }

  async addGarrison(authUid: string, seasonId: string, delta: number): Promise<void> {
    const key = this.stabilityKey(authUid, seasonId);
    const existing = this.stability.get(key);
    if (!existing) return;
    this.stability.set(key, { ...existing, garrison: existing.garrison + delta });
  }

  async resetGarrison(authUid: string, seasonId: string): Promise<void> {
    const key = this.stabilityKey(authUid, seasonId);
    const existing = this.stability.get(key);
    if (!existing) return;
    this.stability.set(key, { ...existing, garrison: 0 });
  }
}
