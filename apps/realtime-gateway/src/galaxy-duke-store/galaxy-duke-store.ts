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
};

export const emptyCourtRecord = (): GalaxyCourtRecord => ({ contributions: {}, totalInfluence: 0 });

export class InMemoryGalaxyDukeStore implements GalaxyDukeStore {
  private readonly states = new Map<string, DukeState>();
  private court: GalaxyCourtRecord = emptyCourtRecord();

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
}
