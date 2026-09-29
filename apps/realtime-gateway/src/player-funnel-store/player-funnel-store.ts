// Durable store behind /admin/players/insights: one row per player with
// first-write-wins milestone timestamps, one row per play session, and one
// row per (anonymous visitor, pre-login step). Thin CRUD — orchestration
// lives in player-funnel-tracker.ts.
//
// Bounding (docs/agents/state-and-persistence-discipline.md): player rows are
// bounded by accounts; sessions and acquisition steps are pruned by age and
// by a hard row cap (see prune()).

export type PlayerFunnelMilestone = "spawned" | "first_move" | "ten_tiles" | "first_contact" | "first_interaction";

export type PlayerFunnelMilestoneDetail = {
  // first_move: the command's action type; first_interaction: attack | truce | alliance.
  type?: string;
  withPlayerId?: string;
  withIsAi?: boolean;
};

export type PlayerFunnelRow = {
  playerId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  // True only when the account was created after tracking began, so funnel
  // cohorts never mix in pre-existing players.
  accountNew: boolean;
  spawnedAt?: number;
  firstMoveAt?: number;
  firstMoveType?: string;
  tenTilesAt?: number;
  firstContactAt?: number;
  firstContactWith?: string;
  firstContactIsAi?: boolean;
  firstInteractionAt?: number;
  firstInteractionType?: string;
  firstInteractionWith?: string;
  firstInteractionIsAi?: boolean;
};

export type PlayerSessionRow = {
  id: number;
  playerId: string;
  startedAt: number;
  endedAt: number;
};

export const ACQUISITION_STEPS = ["visit", "auth_form_shown", "auth_method_clicked", "sign_up"] as const;
export type AcquisitionStep = (typeof ACQUISITION_STEPS)[number];

export type AcquisitionStepRow = {
  visitorId: string;
  step: AcquisitionStep;
  at: number;
  // Small, validated key/value detail (method, referrerHost, utmSource, ...).
  detail: Record<string, string>;
};

export type PlayerFunnelPruneLimits = {
  olderThan: number;
  maxSessionRows: number;
  maxAcquisitionRows: number;
};

export type PlayerFunnelStore = {
  // Creates the row on first sight (accountNew is only honoured then) and
  // bumps lastSeenAt on every call.
  ensurePlayer(playerId: string, at: number, accountNew: boolean): Promise<void>;
  // Sets the milestone only if the player has a row and it isn't set yet.
  // Returns whether this call set it.
  recordMilestone(playerId: string, milestone: PlayerFunnelMilestone, at: number, detail?: PlayerFunnelMilestoneDetail): Promise<boolean>;
  openSession(playerId: string, startedAt: number): Promise<number>;
  touchSession(sessionId: number, endedAt: number): Promise<void>;
  lastSession(playerId: string): Promise<PlayerSessionRow | undefined>;
  // One row per (visitorId, step); returns false when it already existed.
  recordAcquisitionStep(row: AcquisitionStepRow): Promise<boolean>;
  listPlayers(): Promise<PlayerFunnelRow[]>;
  listSessions(sinceAt: number): Promise<PlayerSessionRow[]>;
  listAcquisitionSteps(sinceAt: number): Promise<AcquisitionStepRow[]>;
  prune(limits: PlayerFunnelPruneLimits): Promise<void>;
};

const MILESTONE_AT_FIELD: Record<PlayerFunnelMilestone, keyof PlayerFunnelRow> = {
  spawned: "spawnedAt",
  first_move: "firstMoveAt",
  ten_tiles: "tenTilesAt",
  first_contact: "firstContactAt",
  first_interaction: "firstInteractionAt"
};

export const milestoneAtField = (milestone: PlayerFunnelMilestone): keyof PlayerFunnelRow => MILESTONE_AT_FIELD[milestone];

export const applyMilestoneDetail = (
  row: PlayerFunnelRow,
  milestone: PlayerFunnelMilestone,
  at: number,
  detail: PlayerFunnelMilestoneDetail | undefined
): PlayerFunnelRow => {
  if (milestone === "spawned") return { ...row, spawnedAt: at };
  if (milestone === "ten_tiles") return { ...row, tenTilesAt: at };
  if (milestone === "first_move") return { ...row, firstMoveAt: at, ...(detail?.type ? { firstMoveType: detail.type } : {}) };
  if (milestone === "first_contact") {
    return {
      ...row,
      firstContactAt: at,
      ...(detail?.withPlayerId ? { firstContactWith: detail.withPlayerId } : {}),
      ...(detail?.withIsAi !== undefined ? { firstContactIsAi: detail.withIsAi } : {})
    };
  }
  return {
    ...row,
    firstInteractionAt: at,
    ...(detail?.type ? { firstInteractionType: detail.type } : {}),
    ...(detail?.withPlayerId ? { firstInteractionWith: detail.withPlayerId } : {}),
    ...(detail?.withIsAi !== undefined ? { firstInteractionIsAi: detail.withIsAi } : {})
  };
};

const keepNewest = <T>(rows: T[], max: number, at: (row: T) => number): T[] =>
  rows.length <= max ? rows : [...rows].sort((a, b) => at(b) - at(a)).slice(0, max);

export class InMemoryPlayerFunnelStore implements PlayerFunnelStore {
  private readonly players = new Map<string, PlayerFunnelRow>();
  private sessions: PlayerSessionRow[] = [];
  private acquisition = new Map<string, AcquisitionStepRow>();
  private nextSessionId = 1;

  async ensurePlayer(playerId: string, at: number, accountNew: boolean): Promise<void> {
    const existing = this.players.get(playerId);
    this.players.set(playerId, existing ? { ...existing, lastSeenAt: Math.max(existing.lastSeenAt, at) } : { playerId, firstSeenAt: at, lastSeenAt: at, accountNew });
  }

  async recordMilestone(playerId: string, milestone: PlayerFunnelMilestone, at: number, detail?: PlayerFunnelMilestoneDetail): Promise<boolean> {
    const row = this.players.get(playerId);
    if (!row || row[milestoneAtField(milestone)] !== undefined) return false;
    this.players.set(playerId, applyMilestoneDetail(row, milestone, at, detail));
    return true;
  }

  async openSession(playerId: string, startedAt: number): Promise<number> {
    const id = this.nextSessionId++;
    this.sessions.push({ id, playerId, startedAt, endedAt: startedAt });
    return id;
  }

  async touchSession(sessionId: number, endedAt: number): Promise<void> {
    const session = this.sessions.find((row) => row.id === sessionId);
    if (session) session.endedAt = Math.max(session.endedAt, endedAt);
  }

  async lastSession(playerId: string): Promise<PlayerSessionRow | undefined> {
    let latest: PlayerSessionRow | undefined;
    for (const row of this.sessions) if (row.playerId === playerId && (!latest || row.startedAt >= latest.startedAt)) latest = row;
    return latest ? { ...latest } : undefined;
  }

  async recordAcquisitionStep(row: AcquisitionStepRow): Promise<boolean> {
    const key = `${row.visitorId}\u0000${row.step}`;
    if (this.acquisition.has(key)) return false;
    this.acquisition.set(key, { ...row, detail: { ...row.detail } });
    return true;
  }

  async listPlayers(): Promise<PlayerFunnelRow[]> {
    return [...this.players.values()].map((row) => ({ ...row }));
  }

  async listSessions(sinceAt: number): Promise<PlayerSessionRow[]> {
    return this.sessions.filter((row) => row.endedAt >= sinceAt).map((row) => ({ ...row }));
  }

  async listAcquisitionSteps(sinceAt: number): Promise<AcquisitionStepRow[]> {
    return [...this.acquisition.values()].filter((row) => row.at >= sinceAt).map((row) => ({ ...row, detail: { ...row.detail } }));
  }

  async prune(limits: PlayerFunnelPruneLimits): Promise<void> {
    this.sessions = keepNewest(this.sessions.filter((row) => row.endedAt >= limits.olderThan), limits.maxSessionRows, (row) => row.startedAt);
    const acquisition = keepNewest([...this.acquisition.values()].filter((row) => row.at >= limits.olderThan), limits.maxAcquisitionRows, (row) => row.at);
    this.acquisition = new Map(acquisition.map((row) => [`${row.visitorId}\u0000${row.step}`, row]));
  }
}
