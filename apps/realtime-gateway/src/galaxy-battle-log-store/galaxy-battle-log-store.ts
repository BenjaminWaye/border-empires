// §7: "every raid resolution posts to a galaxy-wide public log on the map
// -- attacker, defender, outcome, nothing hidden." A minimal append-only
// feed, not a full audit trail -- deliberately small since the doc calls
// this "cheap to build (it's a feed, not a system)".
export type GalaxyBattleLogEntry = {
  id: string;
  attackerAuthUid: string;
  defenderAuthUid: string;
  targetSeasonId: string;
  reconOnly: boolean;
  damageDealt: number;
  netDamage: number;
  stabilityAfter: number;
  resolvedAt: number;
};

export type CreateBattleLogEntryInput = Omit<GalaxyBattleLogEntry, "id">;

export type GalaxyBattleLogStore = {
  recordRaid: (input: CreateBattleLogEntryInput) => Promise<GalaxyBattleLogEntry>;
  listRecent: (limit: number) => Promise<GalaxyBattleLogEntry[]>;
};

export class InMemoryGalaxyBattleLogStore implements GalaxyBattleLogStore {
  private readonly entries: GalaxyBattleLogEntry[] = [];
  private nextId = 1;

  async recordRaid(input: CreateBattleLogEntryInput): Promise<GalaxyBattleLogEntry> {
    const entry: GalaxyBattleLogEntry = { id: `battle-${this.nextId++}`, ...input };
    this.entries.push(entry);
    return { ...entry };
  }

  async listRecent(limit: number): Promise<GalaxyBattleLogEntry[]> {
    return [...this.entries]
      .sort((a, b) => b.resolvedAt - a.resolvedAt)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }
}
