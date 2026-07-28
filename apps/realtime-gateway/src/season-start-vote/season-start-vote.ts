export const SEASON_START_VOTE_THRESHOLD = 5;

export class SeasonStartVoteTracker {
  private voters = new Set<string>();

  vote(playerId: string): { count: number; thresholdMet: boolean } {
    this.voters.add(playerId);
    return {
      count: this.voters.size,
      thresholdMet: this.voters.size >= SEASON_START_VOTE_THRESHOLD,
    };
  }

  hasVoted(playerId: string): boolean {
    return this.voters.has(playerId);
  }

  getCount(): number {
    return this.voters.size;
  }

  getVoters(): readonly string[] {
    return [...this.voters];
  }

  reset(): void {
    this.voters.clear();
  }
}
