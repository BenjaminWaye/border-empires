// A House's results in hosted sectors (owner decision Q4: shown on the profile
// marked "Hosted", not counted toward rating; Terms of Sale section 5). The
// hosting service records them here after it saves a sector's results
// (hosted-profile-results-routes.ts), because the profile is served by this
// gateway, which never sees the hosting database.
//
// Personal data: scripts/account-deletion/erase-account-data.mjs deletes an
// erased account's rows (PERSONAL_TABLES).

export type HostedProfileResult = {
  playerId: string;
  sectorId: string;
  /** When the sector's contest ended, or the sector closed. */
  endedAt: number;
  /** False for a sector closed before a House was crowned: shown as not finished. */
  finished: boolean;
  rank: number;
  /** How many Houses the standings held, AI Houses included. */
  houses: number;
};

export interface HostedProfileResultsStore {
  /** Keeps one row per House and sector; a later record of the same sector replaces it. */
  record(results: readonly HostedProfileResult[]): Promise<void>;
  /** Newest first, at most `limit`. */
  listForPlayer(playerId: string, limit: number): Promise<HostedProfileResult[]>;
}

export class InMemoryHostedProfileResultsStore implements HostedProfileResultsStore {
  private readonly rows = new Map<string, HostedProfileResult>();

  async record(results: readonly HostedProfileResult[]): Promise<void> {
    for (const result of results) this.rows.set(`${result.playerId}\u0000${result.sectorId}`, { ...result });
  }

  async listForPlayer(playerId: string, limit: number): Promise<HostedProfileResult[]> {
    return [...this.rows.values()].filter((row) => row.playerId === playerId).sort((a, b) => b.endedAt - a.endedAt).slice(0, limit);
  }
}
