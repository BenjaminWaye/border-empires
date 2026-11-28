// Sends saved hosted-sector results to the game gateway, which shows them on
// each member's public House profile as "Hosted contests", apart from rating
// (owner decision Q4; plan section 15, step 8e). The gateway knows accounts
// by Firebase uid; on a hosted sector server a member's player id is their
// uid, so the standings are cut to the sector's members and sent by uid. AI
// Houses and anyone who is not a member are left out, but still count in
// "of N Houses".
//
// Every saved copy is sent once, and again if it is replaced (an unfinished
// copy by a crowned one). A failure is tried again with a growing delay, for
// as long as it takes; the owner is told once when it keeps failing.
import type { DatabaseSync } from "node:sqlite";

import type { HostingAlert } from "../providers/providers.js";
import type { HostedResultsRecord } from "./hosted-results.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Copies looked at per pass. */
const PUBLISH_BATCH = 20;
/** After this many failures in a row the owner is told. */
export const PUBLISH_ALERT_AFTER = 10;

/** 2, 4, 8 ... minutes, at most 6 hours. */
export const publishRetryDelayMs = (attempts: number): number => Math.min(6 * HOUR, 2 ** attempts * MINUTE);

/** What the gateway's POST /admin/hosted-results/record takes. */
export type HostedResultsPayload = { sectorId: string; endedAt: number; finished: boolean; houses: number; standings: Array<{ uid: string; rank: number }> };

export type GatewayResultsClient = { record(payload: HostedResultsPayload): Promise<void> };

/** Which saved copies have reached the gateway. */
export class SqliteHostedResultsPublishLog {
  constructor(private readonly db: DatabaseSync) {}

  applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hosted_results_published (
        sector_id TEXT PRIMARY KEY,
        published_saved_at INTEGER,
        attempts INTEGER NOT NULL,
        next_attempt_at INTEGER NOT NULL
      );
    `);
  }

  /** Sectors whose latest saved copy has not been sent and is due. */
  listDue(now: number, limit: number): string[] {
    const rows = this.db.prepare(`
      SELECT r.sector_id FROM hosted_results r
      LEFT JOIN hosted_results_published p ON p.sector_id = r.sector_id
      WHERE p.sector_id IS NULL OR ((p.published_saved_at IS NULL OR p.published_saved_at <> r.saved_at) AND p.next_attempt_at <= ?)
      ORDER BY r.saved_at LIMIT ?
    `).all(now, limit) as Array<{ sector_id: string }>;
    return rows.map((row) => row.sector_id);
  }

  markPublished(sectorId: string, savedAt: number, now: number): void {
    this.db.prepare(`INSERT OR REPLACE INTO hosted_results_published (sector_id, published_saved_at, attempts, next_attempt_at) VALUES (?, ?, 0, ?)`).run(sectorId, savedAt, now);
  }

  /** Records a failure; returns the failures in a row so far. */
  noteFailure(sectorId: string, now: number): number {
    const row = this.db.prepare(`SELECT attempts FROM hosted_results_published WHERE sector_id = ?`).get(sectorId) as { attempts: number } | undefined;
    const attempts = Number(row?.attempts ?? 0) + 1;
    this.db
      .prepare(`INSERT INTO hosted_results_published (sector_id, published_saved_at, attempts, next_attempt_at) VALUES (?, NULL, ?, ?)
        ON CONFLICT(sector_id) DO UPDATE SET attempts = excluded.attempts, next_attempt_at = excluded.next_attempt_at`)
      .run(sectorId, attempts, now + publishRetryDelayMs(attempts));
    return attempts;
  }
}

/** The payload for one saved copy: members only, by uid. */
export const resultsPayload = (record: HostedResultsRecord, memberUids: ReadonlySet<string>): HostedResultsPayload => {
  const dropped = typeof record.details.droppedStandings === "number" ? record.details.droppedStandings : 0;
  const houses = Math.max(1, record.standings.length + dropped, ...record.standings.map((standing) => standing.rank));
  return {
    sectorId: record.sectorId,
    endedAt: Math.round(record.endedAt ?? record.savedAt),
    finished: record.crowned,
    houses,
    standings: record.standings
      .filter((standing) => memberUids.has(standing.playerId) && standing.rank >= 1)
      .map((standing) => ({ uid: standing.playerId, rank: standing.rank }))
  };
};

export type HostedResultsPublisherDeps = {
  log: Pick<SqliteHostedResultsPublishLog, "listDue" | "markPublished" | "noteFailure">;
  results: { get(sectorId: string): HostedResultsRecord | undefined };
  memberUids: (sectorId: string) => string[];
  gateway: GatewayResultsClient;
  alert: HostingAlert;
  now: () => number;
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 500);

export const createHostedResultsPublisher = (deps: HostedResultsPublisherDeps) => ({
  /** One pass: sends what is due. A failure on one sector never stops the others. */
  async runOnce(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const sectorId of deps.log.listDue(deps.now(), PUBLISH_BATCH)) {
      const record = deps.results.get(sectorId);
      if (!record) continue;
      const payload = resultsPayload(record, new Set(deps.memberUids(sectorId)));
      try {
        if (payload.standings.length > 0) await deps.gateway.record(payload);
        deps.log.markPublished(sectorId, record.savedAt, deps.now());
        sent += 1;
      } catch (error) {
        failed += 1;
        if (deps.log.noteFailure(sectorId, deps.now()) === PUBLISH_ALERT_AFTER) {
          deps.alert("hosted_results_unpublished", { sectorId, attempts: PUBLISH_ALERT_AFTER, error: errorText(error) });
        }
      }
    }
    return { sent, failed };
  }
});

export type HostedResultsPublisher = ReturnType<typeof createHostedResultsPublisher>;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/** Posts to the gateway with the hosting service key (never ADMIN_API_TOKEN). */
export const createGatewayResultsClient = (options: { gatewayUrl: string; token: string; fetch?: FetchLike }): GatewayResultsClient => {
  const post: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  return {
    async record(payload) {
      const response = await post(`${options.gatewayUrl.replace(/\/+$/, "")}/admin/hosted-results/record`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error(`the gateway answered ${response.status}`);
    }
  };
};
