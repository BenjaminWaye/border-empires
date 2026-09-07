import type { DatabaseSync } from "node:sqlite";

import type {
  CreateSenateProposalInput,
  GalaxySenateProposal,
  GalaxySenateProposalType,
  GalaxySenateStore,
  GalaxySenateVote,
  ResolveSenateProposalInput
} from "./galaxy-senate-store/galaxy-senate-store.js";

type ProposalRow = {
  id: string;
  type: GalaxySenateProposalType;
  proposer_auth_uid: string;
  target_auth_uid: string;
  target_season_id: string | null;
  created_at: number;
  created_at_cycle_index: number;
  status: GalaxySenateProposal["status"];
  resolved_at: number | null;
  active_until_cycle_index: number | null;
};

type VoteRow = {
  proposal_id: string;
  voter_auth_uid: string;
  weight: number;
  cast_at: number;
};

const toProposal = (row: ProposalRow): GalaxySenateProposal => ({
  id: row.id,
  type: row.type,
  proposerAuthUid: row.proposer_auth_uid,
  targetAuthUid: row.target_auth_uid,
  ...(row.target_season_id !== null ? { targetSeasonId: row.target_season_id } : {}),
  createdAt: row.created_at,
  createdAtCycleIndex: row.created_at_cycle_index,
  status: row.status,
  ...(row.resolved_at !== null ? { resolvedAt: row.resolved_at } : {}),
  ...(row.active_until_cycle_index !== null ? { activeUntilCycleIndex: row.active_until_cycle_index } : {})
});

const toVote = (row: VoteRow): GalaxySenateVote => ({
  proposalId: row.proposal_id,
  voterAuthUid: row.voter_auth_uid,
  weight: row.weight,
  castAt: row.cast_at
});

export class SqliteGalaxySenateStore implements GalaxySenateStore {
  private nextId = 1;

  constructor(private readonly db: DatabaseSync) {}

  async applySchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS galaxy_senate_proposals (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        proposer_auth_uid TEXT NOT NULL,
        target_auth_uid TEXT NOT NULL,
        target_season_id TEXT,
        created_at INTEGER NOT NULL,
        created_at_cycle_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        resolved_at INTEGER,
        active_until_cycle_index INTEGER
      );
      CREATE INDEX IF NOT EXISTS galaxy_senate_proposals_status_idx ON galaxy_senate_proposals (status);
      CREATE INDEX IF NOT EXISTS galaxy_senate_proposals_target_type_idx ON galaxy_senate_proposals (target_auth_uid, type);
      CREATE TABLE IF NOT EXISTS galaxy_senate_votes (
        proposal_id TEXT NOT NULL,
        voter_auth_uid TEXT NOT NULL,
        weight REAL NOT NULL,
        cast_at INTEGER NOT NULL,
        PRIMARY KEY (proposal_id, voter_auth_uid)
      );
    `);
  }

  private nextProposalId(): string {
    // Seed the counter off the highest existing numeric suffix so a
    // restarted process (fresh `nextId = 1`) never collides with rows
    // already persisted from a prior run.
    if (this.nextId === 1) {
      const row = this.db.prepare(`SELECT id FROM galaxy_senate_proposals ORDER BY rowid DESC LIMIT 1`).get() as
        | { id: string }
        | undefined;
      const match = row?.id.match(/^senate-(\d+)$/);
      if (match?.[1]) this.nextId = Number.parseInt(match[1], 10) + 1;
    }
    return `senate-${this.nextId++}`;
  }

  async createProposal(input: CreateSenateProposalInput): Promise<GalaxySenateProposal> {
    const id = this.nextProposalId();
    this.db
      .prepare(
        `INSERT INTO galaxy_senate_proposals
           (id, type, proposer_auth_uid, target_auth_uid, target_season_id, created_at, created_at_cycle_index, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`
      )
      .run(id, input.type, input.proposerAuthUid, input.targetAuthUid, input.targetSeasonId ?? null, input.createdAt, input.createdAtCycleIndex);
    const proposal = await this.getProposal(id);
    if (!proposal) throw new Error("failed to read back created senate proposal");
    return proposal;
  }

  async getProposal(id: string): Promise<GalaxySenateProposal | undefined> {
    const row = this.db.prepare(`SELECT * FROM galaxy_senate_proposals WHERE id = ?`).get(id) as ProposalRow | undefined;
    return row ? toProposal(row) : undefined;
  }

  async getPendingProposals(): Promise<GalaxySenateProposal[]> {
    const rows = this.db.prepare(`SELECT * FROM galaxy_senate_proposals WHERE status = 'PENDING'`).all() as ProposalRow[];
    return rows.map(toProposal);
  }

  async resolveProposal(id: string, input: ResolveSenateProposalInput): Promise<void> {
    this.db
      .prepare(`UPDATE galaxy_senate_proposals SET status = ?, resolved_at = ?, active_until_cycle_index = ? WHERE id = ?`)
      .run(input.status, input.resolvedAt, input.activeUntilCycleIndex ?? null, id);
  }

  async addVote(vote: GalaxySenateVote): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO galaxy_senate_votes (proposal_id, voter_auth_uid, weight, cast_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(proposal_id, voter_auth_uid) DO UPDATE SET weight = excluded.weight, cast_at = excluded.cast_at`
      )
      .run(vote.proposalId, vote.voterAuthUid, vote.weight, vote.castAt);
  }

  async getVotesForProposal(proposalId: string): Promise<GalaxySenateVote[]> {
    const rows = this.db.prepare(`SELECT * FROM galaxy_senate_votes WHERE proposal_id = ?`).all(proposalId) as VoteRow[];
    return rows.map(toVote);
  }

  async hasVoted(proposalId: string, voterAuthUid: string): Promise<boolean> {
    const row = this.db
      .prepare(`SELECT 1 FROM galaxy_senate_votes WHERE proposal_id = ? AND voter_auth_uid = ?`)
      .get(proposalId, voterAuthUid);
    return row !== undefined;
  }

  async getLatestResolvedProposal(targetAuthUid: string, type: GalaxySenateProposalType): Promise<GalaxySenateProposal | undefined> {
    const row = this.db
      .prepare(
        `SELECT * FROM galaxy_senate_proposals
         WHERE target_auth_uid = ? AND type = ? AND status != 'PENDING'
         ORDER BY resolved_at DESC LIMIT 1`
      )
      .get(targetAuthUid, type) as ProposalRow | undefined;
    return row ? toProposal(row) : undefined;
  }

  async getActiveEmbargoAuthUids(currentCycleIndex: number): Promise<Set<string>> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT target_auth_uid FROM galaxy_senate_proposals
         WHERE type = 'EMBARGO' AND status = 'PASSED' AND active_until_cycle_index >= ?`
      )
      .all(currentCycleIndex) as Array<{ target_auth_uid: string }>;
    return new Set(rows.map((row) => row.target_auth_uid));
  }

  async listRecentProposals(limit: number): Promise<GalaxySenateProposal[]> {
    const rows = this.db
      .prepare(`SELECT * FROM galaxy_senate_proposals ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as ProposalRow[];
    return rows.map(toProposal);
  }
}
