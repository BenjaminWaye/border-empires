import { isChosenTrickleResource } from "@border-empires/shared";
import { applyGatewayRecoveryNextClientSeq } from "../client-frontier-command/client-frontier-command.js";
import { clearServerDeployingSession } from "../client-server-deploying-session/client-server-deploying-session.js";
import { applyGatewayInitialState, refreshAllGatewayDerivedTownSummaries } from "../client-gateway-sync/client-gateway-sync.js";
import { applyAutoSettlementQueueFromServer, restorePersistedDevelopmentQueueForPlayer } from "../client-development-queue/client-development-queue.js";
import {
  notifyActiveAllianceBreaksOnInit,
  notifyIncomingDiplomacyRequestsOnInit,
  notifyRecentAllianceBreaksOnInit
} from "../client-diplomacy-notifications.js";
import type { ClientState } from "../client-state/client-state.js";

// Extracted out of client-network.ts's single ~2000-line WebSocket message
// handler (that file is well over the repo's 500-line cap and may not grow),
// so the huge INIT branch lives in its own uncapped module instead. Loosely
// typed deps (Record<string, any> & ...) intentionally mirrors the loose
// NetworkDeps typing already used by client-network.ts itself for this same
// message-handling code — this file is a pure code move, not a rewrite.
export type ClientNetworkInitMessageDeps = Record<string, any> & {
  state: ClientState;
};

/** Handles the gateway INIT message: the full player/session bootstrap that
 * arrives once per (re)connection. Moved verbatim out of client-network.ts. */
export const applyInitMessage = (msg: Record<string, unknown>, deps: ClientNetworkInitMessageDeps): void => {
  const {
    state,
    keyFor,
    renderHud,
    setAuthStatus,
    syncAuthOverlay,
    setAuthBusy,
    pushFeed,
    requestViewRefresh,
    applyPendingSettlementsFromServer,
    mergeIncomingTileDetail,
    mergeServerTileWithOptimisticState,
    authProfileColorEl,
    defensibilityPctFromTE,
    seedProfileSetupFields,
    resetStrategicReplayState,
    setWorldSeed,
    clearRenderCaches,
    buildMiniMapBase,
    showCaptureAlert,
    applyShardRainNotice,
    logTileSync,
    logIncomingTechPayload,
    showCaptureAlertSafely,
    applyIncomingRespawnNotice,
    applySettlementRepairDiagnostic,
    syncDesiredFogDisabled,
    clearDeferredBootstrapRefreshTimer,
    clearAuthReconnectTimer,
    resetAuthReconnectAttempt,
    clearQueuedDevelopmentDispatchPending,
    appendFeedEntry
  } = deps;

  clearDeferredBootstrapRefreshTimer();
  state.connection = "initialized";
  state.serverDeploying = false;
  clearServerDeployingSession();
  state.authSessionReady = true;
  state.hasEverInitialized = true;
  resetAuthReconnectAttempt();
  setAuthBusy(false);
  state.authRetrying = false;
  state.authBusyTitle = "";
  state.authBusyDetail = "";
  clearAuthReconnectTimer();
  state.mapLoadStartedAt = Date.now();
  state.firstChunkAt = 0;
  state.chunkFullCount = 0;
  state.hasOwnedTileInCache = false;
  state.lastSubAt = 0;
  state.lastSubCx = Number.NaN;
  state.lastSubCy = Number.NaN;
  state.lastSubRadius = -1;
  state.lastChunkSnapshotGeneration = 0;
  const incomingConfig = (msg.config as { season?: { seasonId: string; worldSeed?: number; mapStyle?: "continents" | "islands" }; fogDisabled?: boolean } | undefined) ?? {};
  const incomingSeason = incomingConfig.season;
  const incomingRuntimeIdentity =
    (msg.runtimeIdentity as
      | {
          fingerprint?: string;
          snapshotLabel?: string;
        }
      | undefined) ?? undefined;
  const incomingPlayer = (msg.player as Record<string, unknown>) ?? {};
  const incomingPlayerId = typeof incomingPlayer.id === "string" ? incomingPlayer.id : "";
  const preserveDiscoveredTilesOnReconnect =
    Boolean(incomingSeason?.seasonId) &&
    state.bridgeDebugSeasonId === incomingSeason?.seasonId &&
    incomingPlayerId.length > 0 &&
    state.me === incomingPlayerId &&
    state.tiles.size > 0 &&
    state.discoveredTiles.size > 0;
  state.fogDisabled = Boolean(incomingConfig.fogDisabled);
  state.serverSupportedMessageTypes = new Set(
    Array.isArray((msg as { supportedMessageTypes?: unknown }).supportedMessageTypes)
      ? ((msg as { supportedMessageTypes: unknown[] }).supportedMessageTypes.filter((type): type is string => typeof type === "string"))
      : []
  );
  state.bridgeDebugSupportedMessageCount = state.serverSupportedMessageTypes.size;
  const gatewayRecovery = (msg.recovery as { nextClientSeq?: unknown; pendingCommands?: unknown } | undefined) ?? undefined;
  applyGatewayRecoveryNextClientSeq(state, gatewayRecovery?.nextClientSeq);
  const player = incomingPlayer;
  state.me = player.id as string;
  state.meName = player.name as string;
  state.playerNames.set(state.me, state.meName);
  state.profileSetupRequired = Boolean(player.profileNeedsSetup);
  state.mapRevealEligible = Boolean(player.canToggleFog);
  syncDesiredFogDisabled();
  setAuthStatus(`Signed in as ${state.authUserLabel || (player.name as string)}.`);
  state.gold = (player.gold as number | undefined) ?? (player.points as number | undefined) ?? state.gold;
  state.level = (player.level as number | undefined) ?? state.level;
  state.mods = (player.mods as typeof state.mods) ?? state.mods;
  state.modBreakdown = (player.modBreakdown as typeof state.modBreakdown | undefined) ?? state.modBreakdown;
  state.incomePerMinute = (player.incomePerMinute as number) ?? state.incomePerMinute;
  state.strategicResources =
    (player.strategicResources as typeof state.strategicResources | undefined) ?? state.strategicResources;
  state.strategicProductionPerMinute =
    (player.strategicProductionPerMinute as typeof state.strategicProductionPerMinute | undefined) ?? state.strategicProductionPerMinute;
  state.economyBreakdown = (player.economyBreakdown as typeof state.economyBreakdown | undefined) ?? state.economyBreakdown;
  state.upkeepPerMinute = (player.upkeepPerMinute as typeof state.upkeepPerMinute | undefined) ?? state.upkeepPerMinute;
  state.upkeepLastTick = (player.upkeepLastTick as typeof state.upkeepLastTick | undefined) ?? state.upkeepLastTick;
  refreshAllGatewayDerivedTownSummaries({ state, keyFor });
  state.stamina = (player.stamina as number | undefined) ?? state.stamina;
  state.manpower = (player.manpower as number | undefined) ?? state.manpower;
  state.manpowerCap = (player.manpowerCap as number | undefined) ?? state.manpowerCap;
  state.manpowerRegenPerMinute = (player.manpowerRegenPerMinute as number | undefined) ?? state.manpowerRegenPerMinute;
  state.logisticsThroughputPerMinute = (player.logisticsThroughputPerMinute as number | undefined) ?? state.logisticsThroughputPerMinute;
  state.territoryT = (player.T as number) ?? state.territoryT;
  state.exposureE = (player.E as number) ?? state.exposureE;
  state.settledT = (player.Ts as number) ?? state.settledT;
  state.settledE = (player.Es as number) ?? state.settledE;
  const initDefensibility = defensibilityPctFromTE(
    (player.Ts as number | undefined) ?? (player.T as number | undefined),
    (player.Es as number | undefined) ?? (player.E as number | undefined)
  );
  state.defensibilityPct = initDefensibility;
  state.defensibilityAnimDir = 0;
  state.defensibilityAnimUntil = 0;
  state.availableTechPicks = (player.availableTechPicks as number) ?? 0;
  state.developmentProcessLimit = (player.developmentProcessLimit as number | undefined) ?? state.developmentProcessLimit;
  if (typeof player.activeDevelopmentProcessCount === "number") clearQueuedDevelopmentDispatchPending();
  state.activeDevelopmentProcessCount =
    (player.activeDevelopmentProcessCount as number | undefined) ?? state.activeDevelopmentProcessCount;
  logTileSync("development_player_update", {
    activeDevelopmentProcessCount: state.activeDevelopmentProcessCount,
    developmentProcessLimit: state.developmentProcessLimit,
    pendingSettlements: (player.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? [],
    developmentQueueLength: state.developmentQueue.length,
    queuedDevelopmentDispatchPending: state.queuedDevelopmentDispatchPending,
    settleProgressCount: state.settleProgressByTile.size
  });
  state.techRootId = player.techRootId as string | undefined;
  state.techIds = (player.techIds as string[]) ?? [];
  state.currentResearch = (player.currentResearch as typeof state.currentResearch | undefined) ?? undefined;
  state.pendingTechUnlockId = "";
  state.domainIds = (player.domainIds as string[]) ?? [];
  const initialTrickle = (player as { chosenTrickleResource?: unknown }).chosenTrickleResource;
  state.chosenTrickleResource = isChosenTrickleResource(initialTrickle) ? initialTrickle : undefined;
  state.imperialWardCharges = (player as { imperialWardCharges?: number }).imperialWardCharges;
  state.revealCapacity = (player.revealCapacity as number) ?? state.revealCapacity;
  state.activeRevealTargets = (player.activeRevealTargets as string[]) ?? state.activeRevealTargets;
  state.abilityCooldowns = (player.abilityCooldowns as typeof state.abilityCooldowns | undefined) ?? state.abilityCooldowns;
  state.revealedEmpireStatsByPlayer.clear();
  state.activeRevealEmpireStatsPopup = undefined;
  if (!preserveDiscoveredTilesOnReconnect) {
    state.discoveredTiles.clear();
    state.discoveredDockTiles.clear();
  }
  state.manpowerBreakdown = (player.manpowerBreakdown as typeof state.manpowerBreakdown | undefined) ?? state.manpowerBreakdown;
  applyPendingSettlementsFromServer(
    (player.pendingSettlements as Array<{ x: number; y: number; startedAt: number; resolvesAt: number }> | undefined) ?? []
  );
  if (state.developmentQueue.length === 0) {
    state.developmentQueue = restorePersistedDevelopmentQueueForPlayer(
      state.me,
      state.tiles,
      new Set(state.settleProgressByTile.keys())
    );
  }
  applyAutoSettlementQueueFromServer(
    state,
    player.autoSettlementQueue as Array<{ x: number; y: number }> | undefined,
    { keyFor }
  );
  state.allies = (player.allies as string[]) ?? [];
  state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? [];
  const myTileColor = player.tileColor as string | undefined;
  if (myTileColor) {
    state.playerColors.set(state.me, myTileColor);
    authProfileColorEl.value = myTileColor;
  }
  if (Array.isArray(player.suggestedColors)) state.suggestedColors = player.suggestedColors as string[];
  const myVisualStyle = player.visualStyle as any;
  if (myVisualStyle) state.playerVisualStyles.set(state.me, myVisualStyle);
  seedProfileSetupFields((player.name as string) || state.authUserLabel, myTileColor ?? authProfileColorEl.value);
  for (const style of ((msg.playerStyles as any[]) ?? [])) {
    if (style.name) state.playerNames.set(style.id, style.name);
    if (style.tileColor) state.playerColors.set(style.id, style.tileColor);
    if (style.visualStyle) state.playerVisualStyles.set(style.id, style.visualStyle);
    if (typeof style.shieldUntil === "number") state.playerShieldUntil.set(style.id, style.shieldUntil);
  }
  const homeTile = player.homeTile as { x: number; y: number } | undefined;
  if (homeTile) {
    state.homeTile = homeTile;
    // Don't stomp a restored last-viewed camera location (client-camera-storage.js)
    // with the home tile on every connect/reconnect — INIT fires before the CHUNK
    // handler's own cameraRestoredFromStorage check ever gets a chance to matter,
    // so this was silently discarding the restore before the player ever saw it.
    if (!state.cameraRestoredFromStorage) {
      state.camX = homeTile.x;
      state.camY = homeTile.y;
    }
    state.selected = homeTile;
  }
  const appliedInitialTileCount = applyGatewayInitialState(
    {
      state,
      keyFor,
      mergeIncomingTileDetail,
      mergeServerTileWithOptimisticState,
      clearRenderCaches,
      buildMiniMapBase
    },
    msg.initialState as { tiles?: Array<{ x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" }> } | undefined,
    { preserveExistingDiscoveredTiles: preserveDiscoveredTilesOnReconnect }
  );
  state.bridgeDebugInitialTileCount = appliedInitialTileCount;
  if (appliedInitialTileCount > 0) {
    state.firstChunkAt = Date.now();
    state.chunkFullCount = Math.max(state.chunkFullCount, 1);
    state.hasOwnedTileInCache = [...state.tiles.values()].some((tile) => tile.ownerId === state.me);
    state.bridgeDebugBootstrap = "rewrite-init";
  } else {
    state.bridgeDebugBootstrap = "legacy-init";
  }
  requestViewRefresh(1, true);
  state.techChoices = (msg.techChoices as string[]) ?? [];
  state.techCatalog = (msg.techCatalog as any[]) ?? [];
  logIncomingTechPayload("INIT", {
    techIds: player.techIds,
    techChoices: msg.techChoices,
    techCatalog: msg.techCatalog,
    currentResearch: player.currentResearch,
    techRootId: player.techRootId,
    availableTechPicks: player.availableTechPicks
  });
  state.domainChoices = (msg.domainChoices as string[]) ?? [];
  state.domainCatalog = (msg.domainCatalog as any[]) ?? [];
  if (!state.domainUiSelectedId && state.domainChoices.length > 0) state.domainUiSelectedId = state.domainChoices[0]!;
  state.missions = (msg.missions as any[]) ?? [];
  state.leaderboard = (msg.leaderboard as typeof state.leaderboard) ?? state.leaderboard;
  state.seasonVictory = (msg.seasonVictory as any[] | undefined) ?? state.seasonVictory;
  state.seasonWinner = (msg.seasonWinner as any | undefined) ?? state.seasonWinner;
  if (typeof msg.acceptLatencyP95Ms === "number") state.bridgeDebugAcceptLatencyP95Ms = msg.acceptLatencyP95Ms;
  if (state.profileSetupRequired) setAuthStatus("Choose a display name and nation color to begin.");
  state.incomingAllianceRequests = (msg.allianceRequests as any[]) ?? [];
  state.outgoingAllianceRequests = (msg.outgoingAllianceRequests as any[] | undefined) ?? [];
  state.activeAllianceBreaks = (msg.activeAllianceBreaks as any[] | undefined) ?? [];
  state.recentAllianceBreaks = (msg.recentAllianceBreaks as any[] | undefined) ?? [];
  state.activeTruces = (msg.activeTruces as any[]) ?? [];
  state.incomingTruceRequests = (msg.truceRequests as any[]) ?? [];
  state.outgoingTruceRequests = (msg.outgoingTruceRequests as any[] | undefined) ?? [];
  state.activeAetherBridges = (msg.activeAetherBridges as any[]) ?? [];
  state.activeAetherWalls = (msg.activeAetherWalls as any[]) ?? [];
  state.strategicReplayEvents = (player.strategicReplayEvents as any[] | undefined) ?? [];
  resetStrategicReplayState();
  state.bridgeDebugSeasonId = incomingSeason?.seasonId ?? "";
  state.bridgeDebugRuntimeFingerprint = incomingRuntimeIdentity?.fingerprint ?? "";
  state.bridgeDebugSnapshotLabel = incomingRuntimeIdentity?.snapshotLabel ?? "";
  const incomingServerBuildSha = (msg as { serverBuildSha?: unknown }).serverBuildSha;
  state.bridgeDebugServerBuildSha = typeof incomingServerBuildSha === "string" ? incomingServerBuildSha : "";
  state.fogDisabled = Boolean(incomingConfig.fogDisabled);
  if (typeof incomingSeason?.worldSeed === "number") {
    setWorldSeed(incomingSeason.worldSeed, incomingSeason.mapStyle);
    clearRenderCaches();
    buildMiniMapBase();
  }
  const mapMeta = (msg.mapMeta as { dockCount?: number; dockPairCount?: number; clusterCount?: number; townCount?: number; dockPairs?: any[] } | undefined) ?? {};
  const shardRainNotice =
    (msg.shardRainNotice as
      | { phase?: "upcoming" | "started"; startsAt?: number; expiresAt?: number; siteCount?: number; sites?: { x: number; y: number }[] }
      | undefined) ?? undefined;
  const offlineActivity =
    (msg.offlineActivity as
      | Array<{ title?: string; detail?: string; type?: string; severity?: string; at?: number; tileKey?: string; actionLabel?: string }>
      | undefined) ?? [];
  applyIncomingRespawnNotice(player.respawnNotice);
  state.dockPairs = mapMeta.dockPairs ?? [];
  state.dockRouteCache.clear();
  pushFeed(`Spawned. ${incomingSeason?.seasonId ? `Season ${incomingSeason.seasonId}.` : ""} Your tile is centered.`, "info", "success");
  if (incomingConfig.fogDisabled) pushFeed("Fog of war is disabled for this server session.", "info", "warn");
  if (offlineActivity.length > 0) {
    for (let index = offlineActivity.length - 1; index >= 0; index -= 1) {
      const entry = offlineActivity[index]!;
      const tileKey = typeof entry.tileKey === "string" ? entry.tileKey : undefined;
      const parsedFocus = tileKey ? (() => {
        const [xText, yText] = tileKey.split(",");
        const x = Number(xText);
        const y = Number(yText);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
      })() : undefined;
      appendFeedEntry({
        title: typeof entry.title === "string" ? entry.title : undefined,
        text: typeof entry.detail === "string" ? entry.detail : "Activity update",
        type: entry.type === "combat" || entry.type === "mission" || entry.type === "error" || entry.type === "info" || entry.type === "alliance" || entry.type === "tech" ? entry.type : "info",
        severity:
          entry.severity === "info" || entry.severity === "success" || entry.severity === "warn" || entry.severity === "error"
            ? entry.severity
            : "info",
        at: typeof entry.at === "number" ? entry.at : Date.now(),
        ...(parsedFocus ? { focusX: parsedFocus.x, focusY: parsedFocus.y, actionLabel: typeof entry.actionLabel === "string" ? entry.actionLabel : "Center" } : {})
      });
    }
    showCaptureAlert(
      "While you were away",
      offlineActivity.length === 1 && typeof offlineActivity[0]?.detail === "string"
        ? offlineActivity[0].detail
        : `${offlineActivity.length} empire updates happened while you were away.`,
      "warn"
    );
  }
  notifyIncomingDiplomacyRequestsOnInit(state, state.incomingAllianceRequests, state.incomingTruceRequests, {
    pushFeed,
    showCaptureAlert: showCaptureAlertSafely
  });
  notifyActiveAllianceBreaksOnInit(state, state.activeAllianceBreaks, {
    pushFeed,
    showCaptureAlert: showCaptureAlertSafely
  });
  notifyRecentAllianceBreaksOnInit(state, state.recentAllianceBreaks, {
    pushFeed,
    showCaptureAlert: showCaptureAlertSafely
  });
  applyShardRainNotice(shardRainNotice);
  applySettlementRepairDiagnostic(msg as Record<string, unknown>);
  syncAuthOverlay();
  renderHud();
};
