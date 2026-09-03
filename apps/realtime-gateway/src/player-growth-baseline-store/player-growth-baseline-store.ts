// Thin CRUD store for one player's "yesterday" baseline (income/manpowerCap
// as of ~24h ago), diffed against the live leaderboard by computePlayerGrowth
// (apps/realtime-gateway/src/activity-api/player-growth.ts) to produce the
// ECONOMY_BOOM/MANPOWER_SURGE daily-story events. Deliberately just get/set
// -- the diff-and-roll-forward orchestration lives in player-growth.ts, not
// here, matching how other stores in this codebase stay thin CRUD and push
// business logic into a separate composable function.
export type StoredPlayerGrowthBaseline = {
  playerId: string;
  incomePerMinute: number;
  manpowerCap: number;
  recordedAt: number;
};

export type PlayerGrowthBaselineStore = {
  get(playerId: string): Promise<StoredPlayerGrowthBaseline | undefined>;
  set(baseline: StoredPlayerGrowthBaseline): Promise<void>;
};

export class InMemoryPlayerGrowthBaselineStore implements PlayerGrowthBaselineStore {
  private readonly baselines = new Map<string, StoredPlayerGrowthBaseline>();

  async get(playerId: string): Promise<StoredPlayerGrowthBaseline | undefined> {
    return this.baselines.get(playerId);
  }

  async set(baseline: StoredPlayerGrowthBaseline): Promise<void> {
    this.baselines.set(baseline.playerId, baseline);
  }
}
