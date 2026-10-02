// Pure aggregation behind GET /admin/players/insights.json. Takes the raw
// player-funnel rows for a window and returns the daily-check numbers:
// the anonymous pre-login funnel, the new-account cohort funnel, session
// length distribution, and one row per player for the drill-down table.
import type { AcquisitionStepRow, PlayerFunnelRow, PlayerSessionRow } from "../player-funnel-store/player-funnel-store.js";

export const SESSION_BUCKETS_MINUTES = [10, 30, 60] as const;
export const PLAYER_SESSION_HISTORY_LIMIT = 20;
export const LANDING_REFERRER_HOST = "borderempires.com";

export type SessionDistribution = {
  count: number;
  medianMs: number | undefined;
  // Share of sessions lasting at least N minutes, keyed by N.
  atLeastMinutes: Record<(typeof SESSION_BUCKETS_MINUTES)[number], number>;
};

export type PlayerInsightRow = PlayerFunnelRow & {
  name: string | undefined;
  sessionCount: number;
  totalSessionMs: number;
  longestSessionMs: number;
  firstSessionMs: number | undefined;
  recentSessions: Array<{ startedAt: number; endedAt: number }>;
};

export type PlayerInsights = {
  generatedAt: number;
  windowDays: number;
  since: number;
  acquisition: {
    visitors: number;
    fromLanding: number;
    formShown: number;
    methodClicked: number;
    signUps: number;
    methods: Record<string, number>;
  };
  cohort: {
    newAccounts: number;
    spawned: number;
    firstMove: number;
    tenTiles: number;
    firstContact: number;
    firstContactWithHuman: number;
    firstInteraction: number;
    interactionTypes: Record<string, number>;
    medianMsToSpawn: number | undefined;
    medianMsToFirstMove: number | undefined;
    medianMsToTenTiles: number | undefined;
    medianMsToFirstContact: number | undefined;
    medianMsToFirstInteraction: number | undefined;
    firstSession: SessionDistribution;
  };
  allSessions: SessionDistribution;
  players: PlayerInsightRow[];
};

const median = (values: number[]): number | undefined => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

export const sessionDistribution = (durationsMs: number[]): SessionDistribution => {
  const share = (minutes: number): number =>
    durationsMs.length === 0 ? 0 : durationsMs.filter((ms) => ms >= minutes * 60_000).length / durationsMs.length;
  return {
    count: durationsMs.length,
    medianMs: median(durationsMs),
    atLeastMinutes: { 10: share(10), 30: share(30), 60: share(60) }
  };
};

const msSinceFirstSeen = (rows: PlayerFunnelRow[], at: (row: PlayerFunnelRow) => number | undefined): number[] =>
  rows.flatMap((row) => {
    const value = at(row);
    return value === undefined ? [] : [Math.max(0, value - row.firstSeenAt)];
  });

const increment = (counts: Record<string, number>, key: string): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export type BuildPlayerInsightsInput = {
  players: PlayerFunnelRow[];
  sessions: PlayerSessionRow[];
  acquisition: AcquisitionStepRow[];
  names: ReadonlyMap<string, string>;
  now: number;
  windowDays: number;
};

export const buildPlayerInsights = (input: BuildPlayerInsightsInput): PlayerInsights => {
  const since = input.now - input.windowDays * 24 * 60 * 60_000;

  const stepVisitors = (step: AcquisitionStepRow["step"]): AcquisitionStepRow[] =>
    input.acquisition.filter((row) => row.step === step && row.at >= since);
  const visits = stepVisitors("visit");
  const methods: Record<string, number> = {};
  for (const row of stepVisitors("auth_method_clicked")) increment(methods, row.detail.method ?? "unknown");

  const sessionsByPlayer = new Map<string, PlayerSessionRow[]>();
  for (const session of input.sessions) {
    const list = sessionsByPlayer.get(session.playerId) ?? [];
    list.push(session);
    sessionsByPlayer.set(session.playerId, list);
  }
  const duration = (session: PlayerSessionRow): number => Math.max(0, session.endedAt - session.startedAt);

  const cohort = input.players.filter((row) => row.accountNew && row.firstSeenAt >= since);
  const interactionTypes: Record<string, number> = {};
  for (const row of cohort) if (row.firstInteractionType) increment(interactionTypes, row.firstInteractionType);
  const firstSessionMs = (playerId: string): number | undefined => {
    const first = sessionsByPlayer.get(playerId)?.reduce<PlayerSessionRow | undefined>((earliest, s) => (!earliest || s.startedAt < earliest.startedAt ? s : earliest), undefined);
    return first ? duration(first) : undefined;
  };

  const players: PlayerInsightRow[] = input.players
    .filter((row) => row.lastSeenAt >= since)
    .map((row) => {
      const sessions = [...(sessionsByPlayer.get(row.playerId) ?? [])].sort((a, b) => b.startedAt - a.startedAt);
      const durations = sessions.map(duration);
      return {
        ...row,
        name: input.names.get(row.playerId),
        sessionCount: sessions.length,
        totalSessionMs: durations.reduce((sum, ms) => sum + ms, 0),
        longestSessionMs: durations.reduce((max, ms) => Math.max(max, ms), 0),
        firstSessionMs: firstSessionMs(row.playerId),
        recentSessions: sessions.slice(0, PLAYER_SESSION_HISTORY_LIMIT).map((s) => ({ startedAt: s.startedAt, endedAt: s.endedAt }))
      };
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  return {
    generatedAt: input.now,
    windowDays: input.windowDays,
    since,
    acquisition: {
      visitors: visits.length,
      fromLanding: visits.filter((row) => row.detail.referrerHost === LANDING_REFERRER_HOST || row.detail.referrerHost === `www.${LANDING_REFERRER_HOST}`).length,
      formShown: stepVisitors("auth_form_shown").length,
      methodClicked: stepVisitors("auth_method_clicked").length,
      signUps: stepVisitors("sign_up").length,
      methods
    },
    cohort: {
      newAccounts: cohort.length,
      spawned: cohort.filter((row) => row.spawnedAt !== undefined).length,
      firstMove: cohort.filter((row) => row.firstMoveAt !== undefined).length,
      tenTiles: cohort.filter((row) => row.tenTilesAt !== undefined).length,
      firstContact: cohort.filter((row) => row.firstContactAt !== undefined).length,
      firstContactWithHuman: cohort.filter((row) => row.firstContactAt !== undefined && row.firstContactIsAi === false).length,
      firstInteraction: cohort.filter((row) => row.firstInteractionAt !== undefined).length,
      interactionTypes,
      medianMsToSpawn: median(msSinceFirstSeen(cohort, (row) => row.spawnedAt)),
      medianMsToFirstMove: median(msSinceFirstSeen(cohort, (row) => row.firstMoveAt)),
      medianMsToTenTiles: median(msSinceFirstSeen(cohort, (row) => row.tenTilesAt)),
      medianMsToFirstContact: median(msSinceFirstSeen(cohort, (row) => row.firstContactAt)),
      medianMsToFirstInteraction: median(msSinceFirstSeen(cohort, (row) => row.firstInteractionAt)),
      firstSession: sessionDistribution(cohort.flatMap((row) => {
        const ms = firstSessionMs(row.playerId);
        return ms === undefined ? [] : [ms];
      }))
    },
    allSessions: sessionDistribution(input.sessions.filter((s) => s.startedAt >= since).map(duration)),
    players
  };
};
