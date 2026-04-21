import { describe, expect, it, vi } from "vitest";

import { showCaptureAlert } from "./client-alerts.js";
import { bindClientNetwork } from "./client-network.js";
import { createInitialState } from "./client-state.js";

class FakeWebSocket {
  static readonly OPEN = 1;

  readyState = FakeWebSocket.OPEN;
  readonly OPEN = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, Array<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const createState = () =>
  ({
    ...createInitialState(),
    playerVisualStyles: new Map<string, unknown>()
  }) as any;

const bind = (state: any, ws: FakeWebSocket) => {
  const renderHud = vi.fn();
  const requestViewRefresh = vi.fn();
  const processActionQueue = vi.fn(() => false);

  bindClientNetwork({
    state,
    ws: ws as unknown as WebSocket,
    wsUrl: "ws://localhost:3101/ws",
    keyFor: (x: number, y: number) => `${x},${y}`,
    renderHud,
    setAuthStatus: vi.fn(),
    syncAuthOverlay: vi.fn(),
    authenticateSocket: vi.fn(async () => {}),
    pushFeed: vi.fn(),
    pushFeedEntry: vi.fn(),
    clearOptimisticTileState: vi.fn(),
    requestViewRefresh,
    applyPendingSettlementsFromServer: vi.fn(),
    mergeIncomingTileDetail: vi.fn((_existing, incoming) => incoming),
    mergeServerTileWithOptimisticState: vi.fn((tile) => tile),
    maybeAnnounceShardSite: vi.fn(),
    markDockDiscovered: vi.fn(),
    centerOnOwnedTile: vi.fn(),
    authProfileNameEl: { value: "" },
    authProfileColorEl: { value: "" },
    defensibilityPctFromTE: vi.fn(() => 0),
    clearPendingCollectVisibleDelta: vi.fn(),
    seedProfileSetupFields: vi.fn(),
    resetStrategicReplayState: vi.fn(),
    setWorldSeed: vi.fn(),
    clearRenderCaches: vi.fn(),
    buildMiniMapBase: vi.fn(),
    shardAlertKeyForPayload: vi.fn(),
    showShardAlert: vi.fn(),
    combatResolutionAlert: vi.fn(() => ({ title: "", detail: "", tone: "success" })),
    wasPredictedCombatAlreadyShown: vi.fn(() => false),
    showCaptureAlert: createRuntimeStyleShowCaptureAlert(state),
    requestSettlement: vi.fn(() => false),
    dropQueuedTargetKeyIfAbsent: vi.fn(),
    processActionQueue,
    clearSettlementProgressForTile: vi.fn(),
    terrainAt: vi.fn(() => "LAND"),
    requestAttackPreviewForTarget: vi.fn(),
    openSingleTileActionMenu: vi.fn(),
    isTileOwnedByAlly: vi.fn(() => false),
    hideShardAlert: vi.fn(),
    explainActionFailure: vi.fn(),
    notifyInsufficientGoldForFrontierAction: vi.fn(),
    clearSettlementProgressByKey: vi.fn(),
    showCollectVisibleCooldownAlert: vi.fn(),
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue: vi.fn(),
    revertOptimisticVisibleCollectDelta: vi.fn(),
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    applyOptimisticTileState: vi.fn()
  } as any);

  return { renderHud, requestViewRefresh, processActionQueue };
};

const createRuntimeStyleShowCaptureAlert =
  (state: any) =>
  (title: string, detail: string, tone: "success" | "error" | "warn" = "error", manpowerLoss?: number): void => {
    showCaptureAlert(state, title, detail, tone, manpowerLoss);
  };

describe("client gateway sync regression", () => {
  it("hydrates init initialState tiles before the first refresh", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { requestViewRefresh } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 10, y: 10 } },
        config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
        supportedMessageTypes: ["ATTACK", "EXPAND", "BREAKTHROUGH_ATTACK", "ATTACK_PREVIEW"],
        initialState: {
          playerId: "player-1",
          tiles: [
            {
              x: 10,
              y: 11,
              terrain: "SEA",
              resource: "FISH",
              ownerId: "player-1",
              ownershipState: "FRONTIER",
              townType: "FARMING",
              townName: "Nauticus",
              townPopulationTier: "SETTLEMENT"
            }
          ]
        }
      })
    });

    expect(state.tiles.get("10,11")).toMatchObject({
      x: 10,
      y: 11,
      terrain: "SEA",
      resource: "FISH",
      ownerId: "player-1",
      ownershipState: "FRONTIER",
      town: expect.objectContaining({ type: "FARMING", name: "Nauticus", populationTier: "SETTLEMENT" })
    });
    expect(state.firstChunkAt).toBeGreaterThan(0);
    expect(state.chunkFullCount).toBe(1);
    expect(state.hasOwnedTileInCache).toBe(true);
    expect(state.discoveredTiles.has("10,11")).toBe(true);
    expect([...state.serverSupportedMessageTypes]).toEqual(["ATTACK", "EXPAND", "BREAKTHROUGH_ATTACK", "ATTACK_PREVIEW"]);
    expect(requestViewRefresh).toHaveBeenCalledWith(1, true);
  });

  it("keeps existing numeric HUD state when rewrite init omits legacy player stats", () => {
    const state = createState();
    state.gold = 0;
    state.level = 0;
    state.stamina = 0;
    state.manpower = 100;
    const ws = new FakeWebSocket();
    const { renderHud } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1" },
        config: {},
        initialState: {
          playerId: "player-1",
          tiles: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
        }
      })
    });

    expect(state.gold).toBe(0);
    expect(state.level).toBe(0);
    expect(state.stamina).toBe(0);
    expect(state.manpower).toBe(100);
    expect(renderHud).toHaveBeenCalled();
  });

  it("adopts recovery nextClientSeq and binds queued command ids to the current frontier action without a queued warning popup", () => {
    const state = createState();
    state.actionCurrent = { x: 10, y: 11, retries: 0, clientSeq: 7, actionType: "EXPAND" };
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: { nextClientSeq: 7, pendingCommands: [] }
      })
    });
    ws.emit("message", {
      data: JSON.stringify({
        type: "COMMAND_QUEUED",
        commandId: "cmd-7",
        clientSeq: 7
      })
    });

    expect(state.nextCommandClientSeq).toBe(8);
    expect(state.actionCurrent).toEqual(expect.objectContaining({ clientSeq: 7, commandId: "cmd-7" }));
    expect(state.captureAlert).toBeUndefined();

    ws.emit("message", {
      data: JSON.stringify({
        type: "ACTION_ACCEPTED",
        commandId: "cmd-7",
        actionType: "EXPAND",
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 },
        resolvesAt: 9999
      })
    });

    expect(state.captureAlert).toBeUndefined();
    expect(state.capture).toEqual(
      expect.objectContaining({
        target: { x: 10, y: 11 },
        resolvesAt: 9999
      })
    );
  });

  it("resolves expand immediately on frontier result even before a follow-up tile delta", () => {
    const state = createState();
    state.me = "player-1";
    state.actionCurrent = { x: 10, y: 11, retries: 0, clientSeq: 7, commandId: "cmd-7", actionType: "EXPAND" };
    state.actionTargetKey = "10,11";
    state.actionInFlight = true;
    state.actionAcceptedAck = true;
    state.capture = { startAt: 1_000, resolvesAt: 2_250, target: { x: 10, y: 11 } };
    state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fogged: false } as any);
    state.tiles.set("10,11", { x: 10, y: 11, terrain: "LAND", fogged: false } as any);
    state.actionQueue = [{ x: 10, y: 12, retries: 0 }];
    state.queuedTargetKeys.add("10,12");
    const ws = new FakeWebSocket();
    const { processActionQueue } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "FRONTIER_RESULT",
        commandId: "cmd-7",
        actionType: "EXPAND",
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 }
      })
    });

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        tone: "success"
      })
    );
    expect(state.actionInFlight).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.actionTargetKey).toBe("");
    expect(state.capture).toBeUndefined();
    expect(processActionQueue).toHaveBeenCalledTimes(1);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA_BATCH",
        commandId: "cmd-7",
        tiles: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER", terrain: "LAND" }]
      })
    });

    expect(state.tiles.get("10,11")).toEqual(expect.objectContaining({ ownerId: "player-1", ownershipState: "FRONTIER" }));
    expect(processActionQueue).toHaveBeenCalledTimes(1);
  });

  it("does not leave queued frontier state stuck when frontier result arrives without any trailing tile delta", () => {
    const state = createState();
    state.me = "player-1";
    state.actionCurrent = { x: 361, y: 179, retries: 0, clientSeq: 5, commandId: "cmd-5", actionType: "EXPAND" };
    state.actionTargetKey = "361,179";
    state.actionInFlight = true;
    state.actionAcceptedAck = true;
    state.capture = { startAt: 1_000, resolvesAt: 2_000, target: { x: 361, y: 179 } };
    state.queuedTargetKeys.add("361,179");
    state.tiles.set("361,179", { x: 361, y: 179, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", fogged: false } as any);
    const ws = new FakeWebSocket();
    const { processActionQueue } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "FRONTIER_RESULT",
        commandId: "cmd-5",
        actionType: "EXPAND",
        origin: { x: 361, y: 178 },
        target: { x: 361, y: 179 }
      })
    });

    expect(state.actionInFlight).toBe(false);
    expect(state.actionAcceptedAck).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.actionTargetKey).toBe("");
    expect(state.queuedTargetKeys.has("361,179")).toBe(false);
    expect(processActionQueue).toHaveBeenCalledTimes(1);
  });

  it("preserves manpower loss on combat result alerts", () => {
    const state = createState();
    state.actionCurrent = { x: 10, y: 11, retries: 0, clientSeq: 9, commandId: "cmd-9", actionType: "ATTACK" };
    state.actionTargetKey = "10,11";
    state.actionInFlight = true;
    state.actionAcceptedAck = true;
    state.combatStartAck = true;
    state.capture = { startAt: 1_000, resolvesAt: 2_250, target: { x: 10, y: 11 } };
    const ws = new FakeWebSocket();

    bindClientNetwork({
      state,
      ws: ws as unknown as WebSocket,
      wsUrl: "ws://localhost:3101/ws",
      keyFor: (x: number, y: number) => `${x},${y}`,
      renderHud: vi.fn(),
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      authenticateSocket: vi.fn(async () => {}),
      pushFeed: vi.fn(),
      pushFeedEntry: vi.fn(),
      clearOptimisticTileState: vi.fn(),
      requestViewRefresh: vi.fn(),
      applyPendingSettlementsFromServer: vi.fn(),
      mergeIncomingTileDetail: vi.fn((_existing, incoming) => incoming),
      mergeServerTileWithOptimisticState: vi.fn((tile) => tile),
      maybeAnnounceShardSite: vi.fn(),
      markDockDiscovered: vi.fn(),
      centerOnOwnedTile: vi.fn(),
      authProfileNameEl: { value: "" },
      authProfileColorEl: { value: "" },
      defensibilityPctFromTE: vi.fn(() => 0),
      clearPendingCollectVisibleDelta: vi.fn(),
      seedProfileSetupFields: vi.fn(),
      resetStrategicReplayState: vi.fn(),
      setWorldSeed: vi.fn(),
      clearRenderCaches: vi.fn(),
      buildMiniMapBase: vi.fn(),
      shardAlertKeyForPayload: vi.fn(),
      showShardAlert: vi.fn(),
      combatResolutionAlert: vi.fn(() => ({ title: "Attack Beaten Back", detail: "Lost the fight.", tone: "warn", manpowerLoss: 60 })),
      wasPredictedCombatAlreadyShown: vi.fn(() => false),
      showCaptureAlert: createRuntimeStyleShowCaptureAlert(state),
      requestSettlement: vi.fn(() => false),
      dropQueuedTargetKeyIfAbsent: vi.fn(),
      processActionQueue: vi.fn(() => false),
      clearSettlementProgressForTile: vi.fn(),
      terrainAt: vi.fn(() => "LAND"),
      requestAttackPreviewForTarget: vi.fn(),
      openSingleTileActionMenu: vi.fn(),
      isTileOwnedByAlly: vi.fn(() => false),
      hideShardAlert: vi.fn(),
      explainActionFailure: vi.fn(),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      clearSettlementProgressByKey: vi.fn(),
      showCollectVisibleCooldownAlert: vi.fn(),
      formatCooldownShort: vi.fn(() => "1s"),
      reconcileActionQueue: vi.fn(),
      revertOptimisticVisibleCollectDelta: vi.fn(),
      revertOptimisticTileCollectDelta: vi.fn(),
      clearPendingCollectTileDelta: vi.fn(),
      playerNameForOwner: vi.fn(),
      applyOptimisticTileState: vi.fn()
    } as any);

    ws.emit("message", {
      data: JSON.stringify({
        type: "COMBAT_RESULT",
        commandId: "cmd-9",
        attackType: "ATTACK",
        attackerWon: false,
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 },
        changes: []
      })
    });

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Attack Beaten Back",
        manpowerLoss: 60
      })
    );
  });

  it("shows queued and recovery alerts correctly with the runtime title-first alert wrapper", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const renderHud = vi.fn();

    bindClientNetwork({
      state,
      ws: ws as unknown as WebSocket,
      wsUrl: "ws://localhost:3101/ws",
      keyFor: (x: number, y: number) => `${x},${y}`,
      renderHud,
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      authenticateSocket: vi.fn(async () => {}),
      pushFeed: vi.fn(),
      pushFeedEntry: vi.fn(),
      clearOptimisticTileState: vi.fn(),
      requestViewRefresh: vi.fn(),
      applyPendingSettlementsFromServer: vi.fn(),
      mergeIncomingTileDetail: vi.fn((_existing, incoming) => incoming),
      mergeServerTileWithOptimisticState: vi.fn((tile) => tile),
      maybeAnnounceShardSite: vi.fn(),
      markDockDiscovered: vi.fn(),
      centerOnOwnedTile: vi.fn(),
      authProfileNameEl: { value: "" },
      authProfileColorEl: { value: "" },
      defensibilityPctFromTE: vi.fn(() => 0),
      clearPendingCollectVisibleDelta: vi.fn(),
      seedProfileSetupFields: vi.fn(),
      resetStrategicReplayState: vi.fn(),
      setWorldSeed: vi.fn(),
      clearRenderCaches: vi.fn(),
      buildMiniMapBase: vi.fn(),
      shardAlertKeyForPayload: vi.fn(),
      showShardAlert: vi.fn(),
      combatResolutionAlert: vi.fn(() => ({ title: "", detail: "", tone: "success" })),
      wasPredictedCombatAlreadyShown: vi.fn(() => false),
      showCaptureAlert: createRuntimeStyleShowCaptureAlert(state),
      requestSettlement: vi.fn(() => false),
      dropQueuedTargetKeyIfAbsent: vi.fn(),
      processActionQueue: vi.fn(() => false),
      clearSettlementProgressForTile: vi.fn(),
      terrainAt: vi.fn(() => "LAND"),
      requestAttackPreviewForTarget: vi.fn(),
      openSingleTileActionMenu: vi.fn(),
      isTileOwnedByAlly: vi.fn(() => false),
      hideShardAlert: vi.fn(),
      explainActionFailure: vi.fn(),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      clearSettlementProgressByKey: vi.fn(),
      showCollectVisibleCooldownAlert: vi.fn(),
      formatCooldownShort: vi.fn(() => "1s"),
      reconcileActionQueue: vi.fn(),
      revertOptimisticVisibleCollectDelta: vi.fn(),
      revertOptimisticTileCollectDelta: vi.fn(),
      clearPendingCollectTileDelta: vi.fn(),
      playerNameForOwner: vi.fn(),
      applyOptimisticTileState: vi.fn()
    } as any);

    state.actionCurrent = { x: 10, y: 11, retries: 0, clientSeq: 3, actionType: "ATTACK" };

    ws.emit("message", {
      data: JSON.stringify({
        type: "COMMAND_QUEUED",
        commandId: "cmd-3",
        clientSeq: 3
      })
    });

    expect(state.captureAlert).toBeUndefined();

    state.actionCurrent = undefined;
    state.actionInFlight = false;

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: {
          nextClientSeq: 4,
          pendingCommands: [
            {
              commandId: "cmd-3",
              clientSeq: 3,
              type: "ATTACK",
              status: "ACCEPTED",
              queuedAt: 1234,
              payload: { fromX: 10, fromY: 10, toX: 10, toY: 11 }
            }
          ]
        }
      })
    });

    expect(state.captureAlert).toBeUndefined();
    expect(renderHud).toHaveBeenCalled();
  });

  it("does not rehydrate a pending frontier command from gateway reconnect recovery", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: {
          nextClientSeq: 8,
          pendingCommands: [
            {
              commandId: "cmd-7",
              clientSeq: 7,
              type: "ATTACK",
              status: "ACCEPTED",
              queuedAt: 1234,
              payload: { fromX: 10, fromY: 10, toX: 10, toY: 11 }
            }
          ]
        }
      })
    });

    expect(state.nextCommandClientSeq).toBe(8);
    expect(state.actionInFlight).toBe(false);
    expect(state.actionAcceptedAck).toBe(false);
    expect(state.actionTargetKey).toBe("");
    expect(state.actionCurrent).toBeUndefined();
    expect(state.captureAlert).toBeUndefined();
  });

  it("applies tile delta batch updates from the gateway protocol", () => {
    const state = createState();
    state.tiles.set("10,11", { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" });
    state.me = "player-1";
    const ws = new FakeWebSocket();
    const { renderHud } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA_BATCH",
        commandId: "cmd-1",
        tiles: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
      })
    });

    expect(state.tiles.get("10,11")).toMatchObject({
      x: 10,
      y: 11,
      ownerId: "player-1",
      ownershipState: "FRONTIER"
    });
    expect(state.firstChunkAt).toBeGreaterThan(0);
    expect(state.chunkFullCount).toBe(1);
    expect(state.hasOwnedTileInCache).toBe(true);
    expect(renderHud).toHaveBeenCalled();
  });

  it("updates player names and colors from runtime PLAYER_STYLE messages", () => {
    const state = createState();
    state.me = "player-1";
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "PLAYER_STYLE",
        playerId: "player-1",
        name: "Nauticus Prime",
        tileColor: "#123456"
      })
    });

    expect(state.meName).toBe("Nauticus Prime");
    expect(state.playerNames.get("player-1")).toBe("Nauticus Prime");
    expect(state.playerColors.get("player-1")).toBe("#123456");
  });
});
