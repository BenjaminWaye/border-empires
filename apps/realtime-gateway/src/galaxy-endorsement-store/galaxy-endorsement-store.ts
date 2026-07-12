// A "galaxy endorsement" is the Emperor's pick of who gets the Imperial Ward
// bonus next season. Emperor = winner of the most recently ended season; the
// pick is open for one hour after the season ends (see
// galaxy-endorsement-auto-start.ts), keyed by that ended season's id so at
// most one pending endorsement can exist at a time.
export type GalaxyEndorsementRecord = {
  endedSeasonId: string;
  emperorPlayerId: string;
  targetPlayerId: string;
  createdAt: number;
  // Set once startNextSeason has actually granted the Imperial Ward charges
  // to the target — prevents the auto-start timer from re-granting on retry.
  appliedAt?: number;
};

export type GalaxyEndorsementStore = {
  getByEndedSeasonId: (endedSeasonId: string) => Promise<GalaxyEndorsementRecord | undefined>;
  upsert: (input: { endedSeasonId: string; emperorPlayerId: string; targetPlayerId: string }) => Promise<GalaxyEndorsementRecord>;
  markApplied: (endedSeasonId: string) => Promise<void>;
};

export class InMemoryGalaxyEndorsementStore implements GalaxyEndorsementStore {
  private readonly byEndedSeasonId = new Map<string, GalaxyEndorsementRecord>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async getByEndedSeasonId(endedSeasonId: string): Promise<GalaxyEndorsementRecord | undefined> {
    const existing = this.byEndedSeasonId.get(endedSeasonId);
    return existing ? { ...existing } : undefined;
  }

  async upsert(input: { endedSeasonId: string; emperorPlayerId: string; targetPlayerId: string }): Promise<GalaxyEndorsementRecord> {
    const existing = this.byEndedSeasonId.get(input.endedSeasonId);
    const record: GalaxyEndorsementRecord = {
      endedSeasonId: input.endedSeasonId,
      emperorPlayerId: input.emperorPlayerId,
      targetPlayerId: input.targetPlayerId,
      createdAt: existing?.createdAt ?? this.now(),
      ...(existing?.appliedAt ? { appliedAt: existing.appliedAt } : {})
    };
    this.byEndedSeasonId.set(input.endedSeasonId, record);
    return { ...record };
  }

  async markApplied(endedSeasonId: string): Promise<void> {
    const existing = this.byEndedSeasonId.get(endedSeasonId);
    if (!existing) return;
    this.byEndedSeasonId.set(endedSeasonId, { ...existing, appliedAt: this.now() });
  }
}
