import type { Player, SeasonWinnerView, SeasonVictoryObjectiveView, TileKey } from "@border-empires/shared";
import type { Ws } from "./server-runtime-config.js";
import type {
  AllianceRequest,
  LeaderboardSnapshotView,
  ManpowerBreakdownLine,
  StrategicResource
} from "./server-shared-types.js";

export type PlayerUpdateDetail = "full" | "combat";

export type PlayerUpdateOptions = {
  detail?: PlayerUpdateDetail;
  includeProgression?: boolean;
  includeGlobalStatus?: boolean;
  includeWorldStatus?: boolean;
  includeEconomy?: boolean;
  includeBreakdowns?: boolean;
  includeSocial?: boolean;
  includeMissions?: boolean;
  includeAllianceRequests?: boolean;
  includeDevelopmentStatus?: boolean;
};

export interface CreateServerPlayerUpdateRuntimeDeps {
  HOT_PLAYER_UPDATE_WARN_MS: number;
  now: () => number;
  applyManpowerRegen: (player: Player) => void;
  bulkSocketForPlayer: (playerId: string) => Ws | undefined;
  getOrInitStrategicStocks: (playerId: string) => Record<StrategicResource, number>;
  techPayloadSnapshotForPlayer: (player: Player, scope: "init" | "player_update" | "tech_update") => {
    techChoices: string[];
    techCatalog: unknown[];
  };
  refreshGlobalStatusCache: (force: boolean) => void;
  pendingSettlementsByTile: Map<TileKey, { ownerId: string; tileKey: TileKey; startedAt: number; resolvesAt: number }>;
  parseKey: (tileKey: TileKey) => [number, number];
  developmentProcessCapacityForPlayer: (playerId: string) => number;
  activeDevelopmentProcessCountForPlayer: (playerId: string) => number;
  logTileSync: (event: string, payload: Record<string, unknown>) => void;
  developmentProcessDebugBreakdownForPlayer: (playerId: string) => Record<string, unknown>;
  playerManpowerCap: (player: Player) => number;
  playerManpowerRegenPerMinute: (player: Player) => number;
  playerDefensiveness: (player: Player) => number;
  empireStyleFromPlayer: (player: Player) => unknown;
  playerModBreakdown: (player: Player) => unknown;
  playerManpowerBreakdown: (player: Player) => {
    cap: ManpowerBreakdownLine[];
    regen: ManpowerBreakdownLine[];
  };
  playerEconomySnapshot: (player: Player) => {
    incomePerMinute: number;
    strategicProductionPerMinute: Record<StrategicResource, number>;
    economyBreakdown: unknown;
    upkeepPerMinute: unknown;
    upkeepLastTick: unknown;
  };
  availableTechPicks: (player: Player) => number;
  reachableDomains: (player: Player) => string[];
  activeDomainCatalog: (player: Player) => unknown[];
  revealCapacityForPlayer: (player: Player) => number;
  getOrInitRevealTargets: (playerId: string) => Set<string>;
  getAbilityCooldowns: (playerId: string) => Map<string, number>;
  activeAetherBridgesById: Map<string, { bridgeId: string; ownerId: string; fromTileKey: TileKey; toTileKey: TileKey; startedAt: number; endsAt: number }>;
  activeAetherWallViews: () => unknown[];
  allianceRequests: Map<string, AllianceRequest>;
  activeTruceViewsForPlayer: (playerId: string) => Array<{ otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number; createdByPlayerId: string }>;
  missionPayload: (player: Player) => unknown;
  leaderboardSnapshotForPlayer: (playerId: string) => LeaderboardSnapshotView;
  seasonVictoryObjectivesForPlayer: (playerId: string) => SeasonVictoryObjectiveView[];
  seasonWinner: SeasonWinnerView | undefined;
  recordServerDebugEvent: (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;
  appLogWarn: (payload: Record<string, unknown>, message: string) => void;
}

export interface ServerPlayerUpdateRuntime {
  sendPlayerUpdate: (player: Player, incomeDelta: number, options?: PlayerUpdateOptions) => void;
}

export const createServerPlayerUpdateRuntime = (
  deps: CreateServerPlayerUpdateRuntimeDeps
): ServerPlayerUpdateRuntime => {
  const sendPlayerUpdate = (player: Player, incomeDelta: number, options: PlayerUpdateOptions = {}): void => {
    const detail = options.detail ?? "full";
    const regenStartedAt = deps.now();
    deps.applyManpowerRegen(player);
    const regenMs = deps.now() - regenStartedAt;
    const ws = deps.bulkSocketForPlayer(player.id);
    if (!ws || ws.readyState !== ws.OPEN) return;
    const startedAt = deps.now();
    const includeProgression = options.includeProgression ?? detail === "full";
    const includeGlobalStatus = options.includeGlobalStatus ?? detail === "full";
    const includeWorldStatus = options.includeWorldStatus ?? detail === "full";
    const includeEconomy = options.includeEconomy ?? detail === "full";
    const includeBreakdowns = options.includeBreakdowns ?? detail === "full";
    const includeSocial = options.includeSocial ?? detail === "full";
    const includeMissions = options.includeMissions ?? detail === "full";
    const includeAllianceRequests = options.includeAllianceRequests ?? detail === "full";
    const includeDevelopmentStatus = options.includeDevelopmentStatus ?? detail === "full";
    const economyStartedAt = deps.now();
    const economy = includeEconomy ? deps.playerEconomySnapshot(player) : undefined;
    const economyMs = deps.now() - economyStartedAt;
    const techPayload = includeProgression ? deps.techPayloadSnapshotForPlayer(player, "player_update") : undefined;
    if (includeGlobalStatus) deps.refreshGlobalStatusCache(false);
    const developmentStartedAt = deps.now();
    const pendingSettlements = includeDevelopmentStatus
      ? [...deps.pendingSettlementsByTile.values()].filter((settlement) => settlement.ownerId === player.id).map((settlement) => {
          const [x, y] = deps.parseKey(settlement.tileKey);
          return { x, y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt };
        })
      : undefined;
    const developmentProcessLimit = includeDevelopmentStatus ? deps.developmentProcessCapacityForPlayer(player.id) : undefined;
    const activeDevelopmentProcessCount = includeDevelopmentStatus ? deps.activeDevelopmentProcessCountForPlayer(player.id) : undefined;
    const developmentMs = deps.now() - developmentStartedAt;
    if (includeDevelopmentStatus) deps.logTileSync("development_player_update", { playerId: player.id, incomeDelta, pendingSettlements, ...deps.developmentProcessDebugBreakdownForPlayer(player.id) });

    const payload: Record<string, unknown> = {
      type: "PLAYER_UPDATE",
      gold: player.points,
      points: player.points,
      level: player.level,
      strategicResources: deps.getOrInitStrategicStocks(player.id),
      stamina: player.stamina,
      manpower: player.manpower,
      manpowerCap: deps.playerManpowerCap(player),
      manpowerRegenPerMinute: deps.playerManpowerRegenPerMinute(player),
      T: player.T,
      E: player.E,
      Ts: player.Ts,
      Es: player.Es,
      shieldUntil: player.spawnShieldUntil,
      defensiveness: deps.playerDefensiveness(player),
      profileNeedsSetup: player.profileComplete !== true
    };
    if (detail === "full") Object.assign(payload, { name: player.name, tileColor: player.tileColor, visualStyle: deps.empireStyleFromPlayer(player), mods: player.mods });
    if (includeBreakdowns) Object.assign(payload, { modBreakdown: deps.playerModBreakdown(player), manpowerBreakdown: deps.playerManpowerBreakdown(player) });
    if (includeEconomy && economy) Object.assign(payload, { incomePerMinute: economy.incomePerMinute, incomeDelta, strategicProductionPerMinute: economy.strategicProductionPerMinute, economyBreakdown: economy.economyBreakdown, upkeepPerMinute: economy.upkeepPerMinute, upkeepLastTick: economy.upkeepLastTick });
    if (includeProgression) {
      Object.assign(payload, {
        currentResearch: player.currentResearch,
        availableTechPicks: deps.availableTechPicks(player),
        techChoices: techPayload?.techChoices ?? [],
        techCatalog: techPayload?.techCatalog ?? [],
        domainIds: [...player.domainIds],
        domainChoices: deps.reachableDomains(player),
        domainCatalog: deps.activeDomainCatalog(player),
        revealCapacity: deps.revealCapacityForPlayer(player),
        activeRevealTargets: [...deps.getOrInitRevealTargets(player.id)],
        abilityCooldowns: Object.fromEntries(deps.getAbilityCooldowns(player.id))
      });
    } else if (detail === "full") {
      payload.domainIds = [...player.domainIds];
    }
    if (includeWorldStatus) {
      payload.activeAetherBridges = [...deps.activeAetherBridgesById.values()].filter((bridge) => bridge.ownerId === player.id).map((bridge) => {
        const [fromX, fromY] = deps.parseKey(bridge.fromTileKey);
        const [toX, toY] = deps.parseKey(bridge.toTileKey);
        return { bridgeId: bridge.bridgeId, ownerId: bridge.ownerId, from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, startedAt: bridge.startedAt, endsAt: bridge.endsAt };
      });
      payload.activeAetherWalls = deps.activeAetherWallViews();
    }
    if (includeDevelopmentStatus) Object.assign(payload, { pendingSettlements, developmentProcessLimit, activeDevelopmentProcessCount });
    if (includeAllianceRequests) Object.assign(payload, { incomingAllianceRequests: [...deps.allianceRequests.values()].filter((request) => request.toPlayerId === player.id), outgoingAllianceRequests: [...deps.allianceRequests.values()].filter((request) => request.fromPlayerId === player.id) });
    if (includeSocial) payload.activeTruces = deps.activeTruceViewsForPlayer(player.id);
    if (includeMissions) payload.missions = deps.missionPayload(player);
    if (includeGlobalStatus) Object.assign(payload, { leaderboard: deps.leaderboardSnapshotForPlayer(player.id), seasonVictory: deps.seasonVictoryObjectivesForPlayer(player.id), seasonWinner: deps.seasonWinner });
    const sendStartedAt = deps.now();
    ws.send(JSON.stringify(payload));
    const sendMs = deps.now() - sendStartedAt;
    const elapsedMs = deps.now() - startedAt;
    if (elapsedMs >= deps.HOT_PLAYER_UPDATE_WARN_MS) {
      const warnPayload = { playerId: player.id, incomeDelta, elapsedMs, regenMs, economyMs, developmentMs, sendMs, detail, includeProgression, includeGlobalStatus, includeWorldStatus, includeEconomy, includeBreakdowns, includeSocial, includeMissions, includeAllianceRequests, includeDevelopmentStatus, pendingSettlements: pendingSettlements?.length ?? 0 };
      deps.recordServerDebugEvent("warn", "slow_player_update", warnPayload);
      deps.appLogWarn(warnPayload, "slow player update");
    }
  };

  return { sendPlayerUpdate };
};
