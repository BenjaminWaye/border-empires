import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { showCaptureAlert } from "../client-alerts/client-alerts.js";
import { bindClientNetwork } from "./client-network.js";
import { createInitialState } from "../client-state/client-state.js";
import * as clientTownCapture from "../client-town-capture/client-town-capture.js";

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

const here = dirname(fileURLToPath(import.meta.url));

const createState = () =>
  ({
    ...createInitialState(),
    playerVisualStyles: new Map<string, unknown>()
  }) as any;

const bind = (state: any, ws: FakeWebSocket) => {
  const renderHud = vi.fn();
  const requestViewRefresh = vi.fn();
  const processActionQueue = vi.fn(() => false);
  const pushFeed = vi.fn();
  const openSingleTileActionMenu = vi.fn();

  bindClientNetwork({
    state,
    ws: ws as unknown as WebSocket,
    wsUrl: "ws://localhost:3101/ws",
    keyFor: (x: number, y: number) => `${x},${y}`,
    renderHud,
    setAuthStatus: vi.fn(),
    syncAuthOverlay: vi.fn(),
    authenticateSocket: vi.fn(async () => {}),
    pushFeed,
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
    settlementProgressForTile: vi.fn(() => false),
    terrainAt: vi.fn(() => "LAND"),
    requestAttackPreviewForTarget: vi.fn(),
    openSingleTileActionMenu,
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

  return { renderHud, requestViewRefresh, processActionQueue, pushFeed, openSingleTileActionMenu };
};

const createRuntimeStyleShowCaptureAlert =
  (state: any) =>
  (title: string, detail: string, tone: "success" | "error" | "warn" = "error", manpowerLoss?: number): void => {
    showCaptureAlert(state, title, detail, tone, manpowerLoss);
  };

describe("client gateway sync regression", () => {
  it("ignores stale attack preview responses when a newer preview request is pending", () => {
    const state = createState();
    state.attackPreviewPendingKey = "4,7->5,7";
    state.attackPreviewPendingRequestId = "attack-preview-2";
    state.attackPreviewLatestRequestIdByKey.set("4,7->5,7", "attack-preview-2");
    const ws = new FakeWebSocket();
    const { renderHud } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ATTACK_PREVIEW_RESULT",
        requestId: "attack-preview-1",
        from: { x: 4, y: 7 },
        to: { x: 5, y: 7 },
        valid: true,
        winChance: 0.43
      })
    });

    expect(state.attackPreview).toBeUndefined();
    expect(state.attackPreviewPendingKey).toBe("4,7->5,7");
    expect(state.attackPreviewPendingRequestId).toBe("attack-preview-2");
    expect(renderHud).not.toHaveBeenCalled();
  });

  it("accepts attack preview responses even when a newer request for a different target is pending", () => {
    const state = createState();
    state.attackPreviewPendingKey = "8,2->9,2";
    state.attackPreviewPendingRequestId = "attack-preview-2";
    state.attackPreviewLatestRequestIdByKey.set("4,7->5,7", "attack-preview-1");
    state.attackPreviewLatestRequestIdByKey.set("8,2->9,2", "attack-preview-2");
    const ws = new FakeWebSocket();
    const { renderHud } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ATTACK_PREVIEW_RESULT",
        requestId: "attack-preview-1",
        from: { x: 4, y: 7 },
        to: { x: 5, y: 7 },
        valid: true,
        winChance: 0.62
      })
    });

    expect(state.attackPreviewCacheByKey.get("4,7->5,7")).toEqual(expect.objectContaining({ winChance: 0.62 }));
    expect(state.attackPreview).toEqual(expect.objectContaining({ fromKey: "4,7", toKey: "5,7", winChance: 0.62 }));
    expect(state.attackPreviewPendingKey).toBe("8,2->9,2");
    expect(state.attackPreviewPendingRequestId).toBe("attack-preview-2");
    expect(state.attackPreviewLatestRequestIdByKey.has("4,7->5,7")).toBe(false);
    expect(state.attackPreviewLatestRequestIdByKey.get("8,2->9,2")).toBe("attack-preview-2");
    expect(renderHud).toHaveBeenCalled();
  });

  it("accepts the current attack preview response and clears its pending request id", () => {
    const state = createState();
    state.attackPreviewPendingKey = "4,7->5,7";
    state.attackPreviewPendingRequestId = "attack-preview-2";
    state.attackPreviewLatestRequestIdByKey.set("4,7->5,7", "attack-preview-2");
    const ws = new FakeWebSocket();
    const { renderHud } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ATTACK_PREVIEW_RESULT",
        requestId: "attack-preview-2",
        from: { x: 4, y: 7 },
        to: { x: 5, y: 7 },
        valid: true,
        winChance: 0.51
      })
    });

    expect(state.attackPreview).toEqual(expect.objectContaining({ fromKey: "4,7", toKey: "5,7", valid: true, winChance: 0.51 }));
    expect(state.attackPreviewCacheByKey.get("4,7->5,7")).toEqual(expect.objectContaining({ winChance: 0.51 }));
    expect(state.attackPreviewPendingKey).toBe("");
    expect(state.attackPreviewPendingRequestId).toBe("");
    expect(renderHud).toHaveBeenCalled();
  });

  it("re-renders an open enemy action menu without restarting the accepted attack preview", () => {
    const state = createState();
    state.me = "me";
    state.attackPreviewPendingKey = "4,7->5,7";
    state.attackPreviewPendingRequestId = "attack-preview-2";
    state.attackPreviewLatestRequestIdByKey.set("4,7->5,7", "attack-preview-2");
    const target = { x: 5, y: 7, terrain: "LAND", ownerId: "enemy", fogged: false };
    state.tiles.set("5,7", target);
    state.tileActionMenu.visible = true;
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "5,7";
    state.tileActionMenu.x = 100;
    state.tileActionMenu.y = 120;
    const ws = new FakeWebSocket();
    const { openSingleTileActionMenu } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ATTACK_PREVIEW_RESULT",
        requestId: "attack-preview-2",
        from: { x: 4, y: 7 },
        to: { x: 5, y: 7 },
        valid: true,
        winChance: 0.51
      })
    });

    expect(openSingleTileActionMenu).toHaveBeenCalledWith(target, 100, 120, { requestAttackPreview: false });
    expect(state.attackPreview).toEqual(expect.objectContaining({ fromKey: "4,7", toKey: "5,7", valid: true, winChance: 0.51 }));
    expect(state.attackPreviewPendingKey).toBe("");
    expect(state.attackPreviewPendingRequestId).toBe("");
  });

  it("shows pending incoming alliance and truce requests when INIT arrives after login", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { pushFeed, renderHud } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: { nextClientSeq: 1, pendingCommands: [] },
        allianceRequests: [
          {
            id: "alliance-1",
            fromPlayerId: "player-2",
            toPlayerId: "player-1",
            fromName: "Valka",
            createdAt: 100
          }
        ],
        truceRequests: [
          {
            id: "truce-1",
            fromPlayerId: "player-3",
            toPlayerId: "player-1",
            fromName: "Beejac",
            createdAt: 200,
            expiresAt: 10_000,
            durationHours: 12
          }
        ]
      })
    });

    expect(state.incomingAllianceRequests).toEqual([expect.objectContaining({ id: "alliance-1", fromName: "Valka" })]);
    expect(state.incomingTruceRequests).toEqual([expect.objectContaining({ id: "truce-1", fromName: "Beejac" })]);
    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Diplomacy requests waiting",
        detail: "You have 1 alliance request and 1 truce offer. Open Alliances to respond.",
        tone: "warn"
      })
    );
    expect(pushFeed).toHaveBeenCalledWith("Valka sent an alliance request. Open Alliances to accept or reject.", "alliance", "warn");
    expect(pushFeed).toHaveBeenCalledWith("Beejac offered a 12h truce. Open Alliances to accept or reject.", "alliance", "warn");
    expect(renderHud).toHaveBeenCalled();

    const feedCallCount = pushFeed.mock.calls.length;
    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: { nextClientSeq: 2, pendingCommands: [] },
        allianceRequests: state.incomingAllianceRequests,
        truceRequests: state.incomingTruceRequests
      })
    });

    expect(pushFeed.mock.calls.length).toBe(feedCallCount + 1);
  });

  it("shows a prominent alert for live incoming alliance and truce requests", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { pushFeed } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ALLIANCE_REQUEST_INCOMING",
        fromName: "Valka",
        request: {
          id: "alliance-1",
          fromPlayerId: "player-2",
          toPlayerId: "player-1",
          createdAt: 100
        }
      })
    });

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Alliance request received",
        detail: "Valka sent an alliance request. Open Alliances to accept or reject.",
        tone: "warn"
      })
    );
    expect(pushFeed).toHaveBeenCalledWith("Valka sent an alliance request. Open Alliances to accept or reject.", "alliance", "warn");

    ws.emit("message", {
      data: JSON.stringify({
        type: "TRUCE_REQUEST_INCOMING",
        fromName: "Beejac",
        request: {
          id: "truce-1",
          fromPlayerId: "player-3",
          toPlayerId: "player-1",
          createdAt: 200,
          expiresAt: 10_000,
          durationHours: 24
        }
      })
    });

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Truce offer received",
        detail: "Beejac offered a 24h truce. Open Alliances to accept or reject.",
        tone: "warn"
      })
    );
    expect(pushFeed).toHaveBeenCalledWith("Beejac offered a 24h truce. Open Alliances to accept or reject.", "alliance", "warn");
  });

  it("shows alliance break notices and keeps the active ally visible", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { pushFeed } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ALLIANCE_UPDATE",
        allies: ["player-2"],
        activeAllianceBreaks: [
          {
            otherPlayerId: "player-2",
            otherPlayerName: "Valka",
            startedAt: 1_000,
            endsAt: 86_401_000,
            createdByPlayerId: "player-2"
          }
        ],
        incomingAllianceRequests: [],
        outgoingAllianceRequests: [],
        announcement: "Valka started a 24h notice to break your alliance."
      })
    });

    expect(state.allies).toEqual(["player-2"]);
    expect(state.activeAllianceBreaks).toEqual([expect.objectContaining({ otherPlayerId: "player-2" })]);
    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Alliance break notice",
        detail: "Valka started a 24h notice to break your alliance.",
        tone: "info"
      })
    );
    expect(pushFeed).toHaveBeenCalledWith("Valka started a 24h notice to break your alliance.", "alliance", "info");
  });

  it("notifies offline players about active alliance break notices on INIT", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { pushFeed } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: { nextClientSeq: 1, pendingCommands: [] },
        allianceRequests: [],
        truceRequests: [],
        recentAllianceBreaks: [],
        activeAllianceBreaks: [
          {
            otherPlayerId: "player-2",
            otherPlayerName: "Valka",
            startedAt: 1_000,
            endsAt: 86_401_000,
            createdByPlayerId: "player-2"
          }
        ]
      })
    });

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Alliance break notice",
        detail: "Valka started a 24h notice to break your alliance.",
        tone: "info"
      })
    );
    expect(pushFeed).toHaveBeenCalledWith("Valka started a 24h notice to break your alliance.", "alliance", "info");
    const feedCallCount = pushFeed.mock.calls.length;

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: { nextClientSeq: 2, pendingCommands: [] },
        allianceRequests: [],
        truceRequests: [],
        recentAllianceBreaks: [],
        activeAllianceBreaks: state.activeAllianceBreaks
      })
    });

    expect(pushFeed.mock.calls.length).toBe(feedCallCount + 1);
  });

  it("notifies offline players about completed alliance breaks on INIT", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { pushFeed } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: { nextClientSeq: 1, pendingCommands: [] },
        allianceRequests: [],
        truceRequests: [],
        activeAllianceBreaks: [],
        recentAllianceBreaks: [
          {
            otherPlayerId: "player-2",
            otherPlayerName: "Valka",
            startedAt: 1_000,
            endsAt: 86_401_000,
            finalizedAt: 86_402_000,
            createdByPlayerId: "player-2"
          }
        ]
      })
    });

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Alliance broken",
        detail: "Your alliance with Valka is now broken.",
        tone: "warn"
      })
    );
    expect(pushFeed).toHaveBeenCalledWith("Your alliance with Valka is now broken.", "alliance", "warn");
    const feedCallCount = pushFeed.mock.calls.length;

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0 },
        config: {},
        recovery: { nextClientSeq: 2, pendingCommands: [] },
        allianceRequests: [],
        truceRequests: [],
        activeAllianceBreaks: [],
        recentAllianceBreaks: state.recentAllianceBreaks
      })
    });

    expect(pushFeed.mock.calls.length).toBe(feedCallCount + 1);
  });

  it("resolves an in-flight attack from post-combat tile sync even when the target stays barbarian", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);

    const state = createState();
    state.me = "player-1";
    state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
    state.tiles.set("10,11", { x: 10, y: 11, terrain: "LAND", ownerId: "barbarian", ownershipState: "BARBARIAN" });
    state.actionCurrent = { x: 10, y: 11, origin: { x: 10, y: 10 }, retries: 0, clientSeq: 9, commandId: "cmd-9", actionType: "ATTACK" };
    state.actionTargetKey = "10,11";
    state.actionInFlight = true;
    state.actionAcceptedAck = true;
    state.combatStartAck = true;
    state.capture = { startAt: 1_000, resolvesAt: 2_250, target: { x: 10, y: 11 } };
    state.queuedTargetKeys.add("10,11");
    const ws = new FakeWebSocket();
    const { processActionQueue } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 10, y: 11, ownerId: "barbarian", ownershipState: "BARBARIAN" }]
      })
    });

    expect(state.actionInFlight).toBe(true);

    vi.setSystemTime(2_300);
    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 10, y: 11, ownerId: "barbarian", ownershipState: "BARBARIAN" }]
      })
    });

    expect(state.actionInFlight).toBe(false);
    expect(state.actionAcceptedAck).toBe(false);
    expect(state.combatStartAck).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.actionTargetKey).toBe("");
    expect(state.capture).toBeUndefined();
    expect(state.queuedTargetKeys.has("10,11")).toBe(false);
    expect(processActionQueue).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("hydrates init initialState tiles before the first refresh", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { requestViewRefresh } = bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 10, y: 10 } },
        config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
        supportedMessageTypes: ["ATTACK", "EXPAND", "ATTACK_PREVIEW"],
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
    });
    expect(state.firstChunkAt).toBeGreaterThan(0);
    expect(state.chunkFullCount).toBe(1);
    expect(state.hasOwnedTileInCache).toBe(true);
    expect(state.discoveredTiles.has("10,11")).toBe(true);
    expect([...state.serverSupportedMessageTypes]).toEqual(["ATTACK", "EXPAND", "ATTACK_PREVIEW"]);
    expect(requestViewRefresh).toHaveBeenCalledWith(1, true);
  });

  it("preserves discovered fogged tiles across reconnect INIT for the same season and player", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 10, y: 10 } },
        config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
        runtimeIdentity: { fingerprint: "runtime-fp-1", snapshotLabel: "snap-a" },
        initialState: {
          playerId: "player-1",
          tiles: [
            {
              x: 10,
              y: 11,
              terrain: "SEA",
              resource: "FISH"
            }
          ]
        }
      })
    });

    expect(state.discoveredTiles.has("10,11")).toBe(true);
    expect(state.tiles.get("10,11")).toMatchObject({
      x: 10,
      y: 11,
      terrain: "SEA",
      resource: "FISH",
      fogged: false
    });

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 10, y: 10 } },
        config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
        runtimeIdentity: { fingerprint: "runtime-fp-2", snapshotLabel: "snap-b" },
        initialState: {
          playerId: "player-1",
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
        }
      })
    });

    expect(state.discoveredTiles.has("10,11")).toBe(true);
    expect(state.tiles.get("10,11")).toMatchObject({
      x: 10,
      y: 11,
      terrain: "SEA",
      resource: "FISH",
      fogged: true
    });
    expect(state.tiles.get("10,10")).toMatchObject({
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      fogged: false
    });
  });

  it("clears discovered cache when reconnect INIT belongs to a different player", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 10, y: 10 } },
        config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
        runtimeIdentity: { fingerprint: "runtime-fp-1", snapshotLabel: "snap-a" },
        initialState: {
          playerId: "player-1",
          tiles: [
            {
              x: 10,
              y: 11,
              terrain: "SEA",
              resource: "FISH"
            }
          ]
        }
      })
    });

    expect(state.discoveredTiles.has("10,11")).toBe(true);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-2", name: "Player 2", points: 5, level: 1, stamina: 0, homeTile: { x: 20, y: 20 } },
        config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
        runtimeIdentity: { fingerprint: "runtime-fp-2", snapshotLabel: "snap-b" },
        initialState: {
          playerId: "player-2",
          tiles: [{ x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }]
        }
      })
    });

    expect(state.discoveredTiles.has("10,11")).toBe(false);
    expect(state.tiles.get("10,11")).toBeUndefined();
    expect(state.tiles.get("20,20")).toMatchObject({
      x: 20,
      y: 20,
      terrain: "LAND",
      ownerId: "player-2",
      ownershipState: "SETTLED",
      fogged: false
    });
  });

  it("keeps previously discovered tiles fogged when a sparse chunk batch omits unexplored tiles", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    state.tiles.set("9,9", {
      x: 9,
      y: 9,
      terrain: "SEA",
      resource: "FISH",
      fogged: true
    } as any);
    state.discoveredTiles.add("9,9");

    ws.emit("message", {
      data: JSON.stringify({
        type: "CHUNK_BATCH",
        generation: 1,
        chunks: [
          {
            cx: 0,
            cy: 0,
            tilesMaskedByFog: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", fogged: false }]
          }
        ]
      })
    });

    expect(state.tiles.get("9,9")).toMatchObject({
      x: 9,
      y: 9,
      terrain: "SEA",
      resource: "FISH",
      fogged: true
    });
    expect(state.discoveredTiles.has("9,9")).toBe(true);
    expect(state.tiles.get("10,10")).toMatchObject({
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      fogged: false
    });
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
      settlementProgressForTile: vi.fn(() => false),
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

  it("stores the full locked combat result from COMBAT_START.result before the reveal timer ends", () => {
    const state = createState();
    state.me = "player-1";
    state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
    state.tiles.set("10,11", { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
    state.actionCurrent = { x: 10, y: 11, origin: { x: 10, y: 10 }, retries: 0, clientSeq: 9, commandId: "cmd-9", actionType: "ATTACK" };
    state.actionTargetKey = "10,11";
    const ws = new FakeWebSocket();
    const combatResolutionAlert = vi.fn(() => ({ title: "Victory", detail: "Won with plunder.", tone: "success", manpowerLoss: 42 }));

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
      combatResolutionAlert,
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
        type: "COMBAT_START",
        commandId: "cmd-9",
        clientSeq: 9,
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 },
        resolvesAt: 2_250,
        result: {
          attackType: "ATTACK",
          attackerWon: true,
          winnerId: "player-1",
          defenderOwnerId: "player-2",
          origin: { x: 10, y: 10 },
          target: { x: 10, y: 11 },
          changes: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }],
          pointsDelta: 18,
          manpowerDelta: -42,
          pillagedGold: 12.5,
          pillagedShare: 0.25,
          pillagedStrategic: { IRON: 3 },
          atkEff: 17,
          defEff: 11,
          winChance: 0.72,
          levelDelta: 0
        }
      })
    });

    expect(combatResolutionAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        pointsDelta: 18,
        manpowerDelta: -42,
        pillagedGold: 12.5,
        pillagedStrategic: { IRON: 3 },
        atkEff: 17,
        defEff: 11,
        winChance: 0.72
      }),
      expect.anything()
    );
    expect(state.pendingCombatReveal).toEqual(
      expect.objectContaining({
        title: "Victory",
        detail: "Won with plunder.",
        manpowerLoss: 42,
        result: expect.objectContaining({
          pointsDelta: 18,
          manpowerDelta: -42,
          pillagedGold: 12.5,
          pillagedStrategic: { IRON: 3 }
        })
      })
    );
  });

  it("preserves captured town titles when a combat result keeps the town on frontier land", () => {
    const state = createState();
    state.me = "player-1";
    state.tiles.set("10,11", {
      x: 10,
      y: 11,
      terrain: "LAND",
      ownerId: "player-2",
      ownershipState: "SETTLED",
      town: { townId: "town-1", name: "Captured Title", type: "FARMING", populationTier: "TOWN" }
    });
    state.actionCurrent = { x: 10, y: 11, origin: { x: 10, y: 10 }, retries: 0, clientSeq: 9, commandId: "cmd-9", actionType: "ATTACK" };
    state.actionTargetKey = "10,11";
    state.actionInFlight = true;
    state.actionAcceptedAck = true;
    state.combatStartAck = true;
    state.capture = { startAt: 1_000, resolvesAt: 2_250, target: { x: 10, y: 11 } };
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "COMBAT_RESULT",
        commandId: "cmd-9",
        attackType: "ATTACK",
        attackerWon: true,
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 },
        changes: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
      })
    });

    expect(state.tiles.get("10,11")).toMatchObject({
      x: 10,
      y: 11,
      ownerId: "player-1",
      ownershipState: "FRONTIER"
    });
    expect(state.tiles.get("10,11")?.town).toMatchObject({
      townId: "town-1",
      name: "Captured Title"
    });
  });

  it("shows the town capture overlay when a COMBAT_RESULT hands us an enemy town", () => {
    const showOverlaySpy = vi.spyOn(clientTownCapture, "showTownCaptureOverlay").mockImplementation(() => {});
    const state = createState();
    state.me = "player-1";
    state.tiles.set("10,11", {
      x: 10,
      y: 11,
      terrain: "LAND",
      ownerId: "player-2",
      ownershipState: "SETTLED",
      town: { townId: "town-1", name: "Captured Title", type: "FARMING", populationTier: "TOWN" }
    });
    state.actionCurrent = { x: 10, y: 11, origin: { x: 10, y: 10 }, retries: 0, clientSeq: 9, commandId: "cmd-9", actionType: "ATTACK" };
    state.actionTargetKey = "10,11";
    state.actionInFlight = true;
    state.actionAcceptedAck = true;
    state.combatStartAck = true;
    state.capture = { startAt: 1_000, resolvesAt: 2_250, target: { x: 10, y: 11 } };
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "COMBAT_RESULT",
        commandId: "cmd-9",
        attackType: "ATTACK",
        attackerWon: true,
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 },
        changes: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
      })
    });

    expect(showOverlaySpy).toHaveBeenCalledTimes(1);
    expect(showOverlaySpy.mock.calls[0]?.[0]).toMatchObject({
      x: 10,
      y: 11,
      townName: "Captured Title"
    });
    showOverlaySpy.mockRestore();
  });

  it("preserves frontier towns during authoritative tile delta reconciliation", () => {
    const state = createState();
    state.me = "player-1";
    state.tiles.set("10,11", {
      x: 10,
      y: 11,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "FRONTIER",
      town: { townId: "town-1", name: "Captured Title", type: "FARMING", populationTier: "TOWN" }
    });
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA_BATCH",
        tiles: [
          {
            x: 10,
            y: 11,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            town: { townId: "town-1", name: "Captured Title", type: "FARMING", populationTier: "TOWN" }
          }
        ]
      })
    });

    expect(state.tiles.get("10,11")).toMatchObject({
      x: 10,
      y: 11,
      ownerId: "player-1",
      ownershipState: "FRONTIER",
      town: expect.objectContaining({
        townId: "town-1",
        name: "Captured Title"
      })
    });
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

  // PLAYER_STYLE handling now lives in client-player-style-message.ts; see
  // client-player-style-message.test.ts for its regression coverage
  // (including the self-vs-other-player re-render behavior).

  it("does not synthesize town support from sparse gateway deltas", () => {
    const state = createState();
    state.me = "player-1";
    state.upkeepLastTick.foodCoverage = 0.5;
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND" });
    state.tiles.set("10,9", { x: 10, y: 9, terrain: "LAND", resource: "FISH" });

    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            townType: "FARMING",
            townName: "Rivetstead Causeway",
            townPopulationTier: "TOWN"
          }
        ]
      })
    });

    expect(state.tiles.get("10,10")?.town).toBeUndefined();

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 10, y: 9, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" }
        ]
      })
    });

    expect(state.tiles.get("10,10")?.town).toBeUndefined();
  });

  it("does not synthesize town fed-state from empire FOOD coverage", () => {
    const state = createState();
    state.me = "player-1";
    state.upkeepLastTick.foodCoverage = 1;
    state.tiles.set("9,10", { x: 9, y: 10, terrain: "LAND" });

    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            townType: "FARMING",
            townName: "Remote Granary",
            townPopulationTier: "TOWN"
          },
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ]
      })
    });

    expect(state.tiles.get("10,10")?.town).toBeUndefined();
  });

  it("does not hydrate sparse gateway towns when PLAYER_UPDATE changes FOOD coverage", () => {
    const state = createState();
    state.me = "player-1";
    state.upkeepLastTick.foodCoverage = 0.5;

    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            townType: "FARMING",
            townName: "Waystation",
            townPopulationTier: "TOWN"
          },
          { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ]
      })
    });

    expect(state.tiles.get("10,10")?.town).toBeUndefined();

    ws.emit("message", {
      data: JSON.stringify({
        type: "PLAYER_UPDATE",
        upkeepLastTick: { foodCoverage: 1 }
      })
    });

    expect(state.tiles.get("10,10")?.town).toBeUndefined();
  });


  it("replaces cached gateway tiles when fog restore sends a full snapshot reset", () => {
    const source = readFileSync(resolve(here, "./client-network.ts"), "utf8");

    expect(source).toContain('if (msg.type === "TILE_SNAPSHOT_REPLACE") {');
    expect(source).toContain('const appliedTileCount = applyGatewayInitialState(');
    expect(source).toContain('requestViewRefresh(2, true);');
  });

});
