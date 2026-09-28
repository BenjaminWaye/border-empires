import { MAX_HALL_OF_FAME } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { FIRST_ERA, type EraState, type HallEntry } from "../galaxy-duke-engine/galaxy-duke-convergence.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";

// Per-Duke state (§26) plus the Court's Move-Against-the-Court ledger.
// Court Strength itself is derived on read (start - 10 x captured Sectors -
// committed Influence / 5), so only the contributions are stored.
export type GalaxyCourtRecord = {
  // Influence each Duke has committed to Move Against the Court (§21.2).
  contributions: Record<string, number>;
  totalInfluence: number;
};

export type GalaxyDukeStore = {
  get: (authUid: string) => Promise<DukeState | undefined>;
  put: (state: DukeState) => Promise<void>;
  getAll: () => Promise<DukeState[]>;
  getCourt: () => Promise<GalaxyCourtRecord>;
  // Adds to a Duke's committed Influence and returns the new record.
  addCourtContribution: (authUid: string, influence: number) => Promise<GalaxyCourtRecord>;
  // Convergence (§27). `now` seeds era 1 the first time it is read.
  getEra: (now: number) => Promise<EraState>;
  // Records the ended era, clears the Court's wagers and starts `next`, together.
  endEra: (entry: HallEntry, next: EraState) => Promise<void>;
  // Newest first, at most MAX_HALL_OF_FAME.
  getHallOfFame: () => Promise<HallEntry[]>;
};

export const emptyCourtRecord = (): GalaxyCourtRecord => ({ contributions: {}, totalInfluence: 0 });

export class InMemoryGalaxyDukeStore implements GalaxyDukeStore {
  private readonly states = new Map<string, DukeState>();
  private court: GalaxyCourtRecord = emptyCourtRecord();
  private era: EraState | undefined;
  private hall: HallEntry[] = [];

  async get(authUid: string): Promise<DukeState | undefined> {
    const state = this.states.get(authUid);
    return state ? structuredClone(state) : undefined;
  }

  async put(state: DukeState): Promise<void> {
    this.states.set(state.authUid, structuredClone(state));
  }

  async getAll(): Promise<DukeState[]> {
    return [...this.states.values()].map((s) => structuredClone(s));
  }

  async getCourt(): Promise<GalaxyCourtRecord> {
    return structuredClone(this.court);
  }

  async addCourtContribution(authUid: string, influence: number): Promise<GalaxyCourtRecord> {
    const contributions = { ...this.court.contributions, [authUid]: (this.court.contributions[authUid] ?? 0) + influence };
    this.court = { contributions, totalInfluence: this.court.totalInfluence + influence };
    return structuredClone(this.court);
  }

  async getEra(now: number): Promise<EraState> {
    this.era ??= FIRST_ERA(now);
    return { ...this.era };
  }

  async endEra(entry: HallEntry, next: EraState): Promise<void> {
    this.hall = [structuredClone(entry), ...this.hall].slice(0, MAX_HALL_OF_FAME);
    this.court = emptyCourtRecord();
    this.era = { ...next };
  }

  async getHallOfFame(): Promise<HallEntry[]> {
    return structuredClone(this.hall);
  }
}
