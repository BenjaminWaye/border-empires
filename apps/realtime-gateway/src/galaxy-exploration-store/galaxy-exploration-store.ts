// Exploration/fog-of-war (§17) v1: per-empire Surveyed intel snapshots.
// §17.2: "a rendering and intel gate, not a simulation gate... no per-empire
// world state, only a per-empire set of revealed system ids." This store is
// that set, plus the timestamped Garrison/Stability snapshot §17.2's
// Surveyed tier promises ("Garrison 180 -- 4 Cycles ago").
//
// JUDGMENT CALL -- charting sources scoped to v1: §17.3 lists three sources
// (passive vision from holdings, Scout missions, Deep Sensor Array). Deep
// Sensor Array requires the Wonder system (§5) which doesn't exist yet, and
// passive vision needs a real spatial/radius model this backend doesn't
// have (see galaxy-fleet-config.ts's own travel-time judgment call for the
// same gap). This v1 slice only wires the Scout-mission source
// (galaxy-fleet-scheduler.ts, on a recon-only order resolving) -- an
// empire's own held territories are always fully known regardless of this
// store (galaxy-exploration-routes.ts folds them in live), so there's no
// separate "chart your own backyard" mechanic needed here.
export type GalaxySurveySnapshot = {
  authUid: string;
  seasonId: string;
  stability: number;
  garrison: number;
  surveyedAt: number;
};

export type RecordSurveyInput = GalaxySurveySnapshot;

export type GalaxyExplorationStore = {
  // Upsert: a later survey of the same (authUid, seasonId) replaces the
  // snapshot -- §17.2's "the numbers attached to it are stamped with a
  // date", always the most recent look, never accumulated history.
  recordSurvey: (input: RecordSurveyInput) => Promise<void>;
  getSurveysForOwner: (authUid: string) => Promise<GalaxySurveySnapshot[]>;
};

export class InMemoryGalaxyExplorationStore implements GalaxyExplorationStore {
  private readonly surveys = new Map<string, GalaxySurveySnapshot>();

  private key(authUid: string, seasonId: string): string {
    return `${authUid}::${seasonId}`;
  }

  async recordSurvey(input: RecordSurveyInput): Promise<void> {
    this.surveys.set(this.key(input.authUid, input.seasonId), { ...input });
  }

  async getSurveysForOwner(authUid: string): Promise<GalaxySurveySnapshot[]> {
    return [...this.surveys.values()].filter((s) => s.authUid === authUid).map((s) => ({ ...s }));
  }
}
