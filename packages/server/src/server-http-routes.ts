import type { FastifyInstance } from "fastify";
import type { Player, Season, SeasonVictoryObjectiveView, SeasonWinnerView, Tile, TileKey } from "@border-empires/shared";
import type { LeaderboardSnapshotView, SeasonArchiveEntry } from "./server-shared-types.js";
import type { TelemetryCounters } from "./server-effects.js";

type RuntimeIncidentLogLike = {
  bootId: string;
  getLastCrashReport: () => unknown;
};

type ServerDebugBundleLike = {
  snapshot: (limit?: number) => Array<{
    at: number;
    level: "info" | "warn" | "error";
    event: string;
    payload: Record<string, unknown>;
  }>;
  snapshotAttackTraces: (limit?: number) => Array<{
    traceId: string;
    firstAt: number;
    lastAt: number;
    playerId?: string;
    actionType?: string;
    origin?: unknown;
    target?: unknown;
    events: Array<{
      at: number;
      level: "info" | "warn" | "error";
      event: string;
      payload: Record<string, unknown>;
    }>;
  }>;
};

const ATTACK_DEBUG_EVENT_PREFIXES = ["frontier_", "send_control_"];
const ATTACK_DEBUG_EVENT_NAMES = new Set([
  "player_update_timing",
  "vision_delta_timing",
  "update_ownership_timing",
  "post_combat_follow_up_timing",
  "settlement_resolve_timing",
  "snapshot_save_requested",
  "snapshot_save_started",
  "snapshot_save_timing",
  "slow_player_update",
  "slow_post_combat_follow_up",
  "slow_update_ownership"
]);

const attackDebugServerEvents = (
  events: Array<{
    at: number;
    level: "info" | "warn" | "error";
    event: string;
    payload: Record<string, unknown>;
  }>
) => {
  const controlPath = events.filter((entry) =>
    ATTACK_DEBUG_EVENT_PREFIXES.some((prefix) => entry.event.startsWith(prefix))
  );
  const hotPath = events.filter((entry) => ATTACK_DEBUG_EVENT_NAMES.has(entry.event));
  const slowOrWarn = events.filter((entry) => entry.level !== "info" || entry.event.startsWith("slow_"));
  return {
    controlPath: controlPath.slice(-120),
    hotPath: hotPath.slice(-120),
    slowOrWarn: slowOrWarn.slice(-120)
  };
};

interface RegisterServerHttpRoutesDeps {
  startupState: { ready: boolean; startedAt: number; completedAt?: number; currentPhase?: string };
  activeSeason: () => Season;
  seasonWinner?: () => SeasonWinnerView | undefined;
  activeRootNodeIds: () => string[];
  activeTechNodeCount: () => number;
  archiveCount: () => number;
  currentLeaderboardSnapshot: () => LeaderboardSnapshotView;
  currentVictoryPressureObjectives: () => SeasonVictoryObjectiveView[];
  seasonArchives: () => SeasonArchiveEntry[];
  runtimeDashboardPayload: () => unknown;
  renderRuntimeDashboardHtml: () => string;
  runtimeIncidentLog: RuntimeIncidentLogLike;
  seasonsEnabled: boolean;
  startNewSeason: () => void;
  saveSnapshot: () => Promise<void>;
  regenerateWorldInPlace: () => void;
  players: Map<string, Player>;
  onlineSocketCount: () => number;
  townsByTile: Map<TileKey, { tileKey: TileKey }>;
  parseKey: (tileKey: TileKey) => [number, number];
  playerTile: (x: number, y: number) => Tile;
  townSupport: (tileKey: TileKey, ownerId: string) => { supportCurrent: number; supportMax: number };
  now: () => number;
  telemetryCounters: TelemetryCounters;
  aiTurnDebugByPlayer: Map<string, { name: string; reason: string }>;
  buildAdminPlayersPayload: () => unknown;
  serverDebugBundle: ServerDebugBundleLike;
}

const HQ_ARCHIVE_LIMIT = 5;
const HQ_ARCHIVE_ROW_LIMIT = 3;

const trimSeasonArchiveEntry = (entry: SeasonArchiveEntry): SeasonArchiveEntry => {
  const trimmed: SeasonArchiveEntry = {
    seasonId: entry.seasonId,
    endedAt: entry.endedAt,
    mostTerritory: entry.mostTerritory.slice(0, HQ_ARCHIVE_ROW_LIMIT),
    mostPoints: entry.mostPoints.slice(0, HQ_ARCHIVE_ROW_LIMIT),
    longestSurvivalMs: entry.longestSurvivalMs.slice(0, HQ_ARCHIVE_ROW_LIMIT)
  };
  if (entry.winner) trimmed.winner = entry.winner;
  return trimmed;
};

export const registerServerHttpRoutes = (app: FastifyInstance, deps: RegisterServerHttpRoutesDeps): void => {
  app.get("/health", async (_request, reply) => {
    if (!deps.startupState.ready) {
      reply.code(503);
      return {
        ok: false,
        status: "starting",
        startupElapsedMs: Date.now() - deps.startupState.startedAt,
        phase: deps.startupState.currentPhase ?? "boot"
      };
    }
    return {
      ok: true,
      startupElapsedMs: (deps.startupState.completedAt ?? Date.now()) - deps.startupState.startedAt
    };
  });

  app.get("/season", async () => ({
    activeSeason: deps.activeSeason(),
    seasonWinner: deps.seasonWinner?.(),
    seasonTechTreeId: deps.activeSeason().techTreeConfigId,
    activeRoots: deps.activeRootNodeIds(),
    activeTechNodeCount: deps.activeTechNodeCount(),
    archiveCount: deps.archiveCount()
  }));

  app.get("/hq/summary", async () => ({
    ok: true,
    at: deps.now(),
    season: deps.activeSeason(),
    seasonWinner: deps.seasonWinner?.(),
    seasonTechTreeId: deps.activeSeason().techTreeConfigId,
    activeRoots: deps.activeRootNodeIds(),
    activeTechNodeCount: deps.activeTechNodeCount(),
    archiveCount: deps.archiveCount(),
    leaderboard: deps.currentLeaderboardSnapshot(),
    seasonVictory: deps.currentVictoryPressureObjectives(),
    seasonArchives: deps.seasonArchives().slice(-HQ_ARCHIVE_LIMIT).reverse().map(trimSeasonArchiveEntry),
    onlinePlayers: deps.onlineSocketCount(),
    totalPlayers: deps.players.size,
    townCount: deps.townsByTile.size
  }));

  app.get("/admin/telemetry", async () => {
    let activeTowns = 0;
    let supportSum = 0;
    let supportCount = 0;
    for (const town of deps.townsByTile.values()) {
      const [x, y] = deps.parseKey(town.tileKey);
      const tile = deps.playerTile(x, y);
      if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
      activeTowns += 1;
      const support = deps.townSupport(town.tileKey, tile.ownerId);
      if (support.supportMax <= 0) continue;
      supportSum += support.supportCurrent / support.supportMax;
      supportCount += 1;
    }
    return {
      ok: true,
      at: deps.now(),
      onlinePlayers: deps.onlineSocketCount(),
      totalPlayers: deps.players.size,
      activeTowns,
      avgTownSupportRatio: supportCount > 0 ? supportSum / supportCount : 0,
      counters: deps.telemetryCounters
    };
  });

  app.get("/admin/ai/debug", async () => {
    const entries = [...deps.aiTurnDebugByPlayer.values()].sort((a, b) => a.name.localeCompare(b.name));
    const reasons = new Map<string, number>();
    for (const entry of entries) reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
    return {
      ok: true,
      at: deps.now(),
      aiPlayers: entries.length,
      reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      entries
    };
  });

  app.get("/admin/players", async () => deps.buildAdminPlayersPayload());
  app.get("/admin/runtime/debug", async () => deps.runtimeDashboardPayload());
  app.get("/admin/runtime/incidents", async () => ({
    ok: true,
    currentBootId: deps.runtimeIncidentLog.bootId,
    lastUncleanShutdown: deps.runtimeIncidentLog.getLastCrashReport()
  }));
  app.get("/admin/runtime/debug-bundle", async () => ({
    recentServerEvents: deps.serverDebugBundle.snapshot(250),
    attackDebug: attackDebugServerEvents(deps.serverDebugBundle.snapshot(250)),
    attackTraces: deps.serverDebugBundle.snapshotAttackTraces(40),
    ok: true,
    at: deps.now(),
    health: deps.startupState.ready
      ? {
          ok: true,
          startupElapsedMs: (deps.startupState.completedAt ?? Date.now()) - deps.startupState.startedAt
        }
      : {
          ok: false,
          status: "starting",
          startupElapsedMs: Date.now() - deps.startupState.startedAt,
          phase: deps.startupState.currentPhase ?? "boot"
        },
    runtime: deps.runtimeDashboardPayload(),
    incidents: {
      currentBootId: deps.runtimeIncidentLog.bootId,
      lastUncleanShutdown: deps.runtimeIncidentLog.getLastCrashReport()
    },
  }));
  app.get("/admin/runtime/dashboard", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return deps.renderRuntimeDashboardHtml();
  });

  app.post("/admin/season/rollover", async () => {
    if (!deps.seasonsEnabled) return { ok: false, disabled: true, message: "seasons temporarily disabled" };
    deps.startNewSeason();
    await deps.saveSnapshot();
    return { ok: true, activeSeason: deps.activeSeason() };
  });

  app.post("/admin/world/regenerate", async () => {
    deps.regenerateWorldInPlace();
    await deps.saveSnapshot();
    return { ok: true, activeSeason: deps.activeSeason(), regenerated: true };
  });
};
