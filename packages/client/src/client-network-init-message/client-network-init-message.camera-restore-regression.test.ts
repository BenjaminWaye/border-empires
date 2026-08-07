import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "../client-network/client-network.js";
import { createInitialState } from "../client-state/client-state.js";
import { CAMERA_LOCATION_STORAGE_KEY } from "../client-constants.js";

// Regression coverage for a real bug report: "location is not persisted".
// Root cause: this INIT handler unconditionally snapped the camera to the
// player's home tile on every connect/reconnect, before the restored
// last-viewed location (client-camera-storage.ts) was ever shown to the
// player — the CHUNK-handler's own cameraRestoredFromStorage guard (see
// client-network.ts) never got a chance to matter because INIT runs first
// and always wins when a homeTile is present, which is virtually always.
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

const createState = () => ({ ...createInitialState(), playerVisualStyles: new Map<string, unknown>() }) as any;

const bind = (state: any, ws: FakeWebSocket): void => {
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
    mergeIncomingTileDetail: vi.fn((_existing: unknown, incoming: unknown) => incoming),
    mergeServerTileWithOptimisticState: vi.fn((tile: unknown) => tile),
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
    showCaptureAlert: vi.fn(),
    requestSettlement: vi.fn(() => false),
    dropQueuedTargetKeyIfAbsent: vi.fn(),
    processActionQueue: vi.fn(() => false),
    clearSettlementProgressForTile: vi.fn(),
    settlementProgressForTile: vi.fn(() => false),
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
};

const sendInit = (ws: FakeWebSocket): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 } },
      config: {},
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

describe("INIT camera-restore regression", () => {
  it("does not stomp a restored last-viewed camera location with the home tile", () => {
    const state = createState();
    state.camX = 500;
    state.camY = -300;
    state.cameraRestoredFromStorage = true;
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws);

    expect(state.camX).toBe(500);
    expect(state.camY).toBe(-300);
    // homeTile itself should still be recorded — only the camera position is protected.
    expect(state.homeTile).toEqual({ x: 40, y: 40 });
  });

  it("still centers on the home tile when there is nothing to restore (unchanged default behavior)", () => {
    const state = createState();
    state.cameraRestoredFromStorage = false;
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws);

    expect(state.camX).toBe(40);
    expect(state.camY).toBe(40);
  });

  it("does not re-snap the camera to the home tile on a second INIT from an in-place reconnect", () => {
    // In-place reconnect (client-multiplex-websocket.ts reconnect()) can now
    // deliver a second INIT within the same browser session. Before this
    // guard (isFirstInitThisSession), cameraRestoredFromStorage is already
    // consumed to false by the first CHUNK batch (client-network.ts:~980),
    // so a naive reconnect would find the flag false and snap back to the
    // home tile, discarding wherever the player had moved the camera.
    const state = createState();
    state.cameraRestoredFromStorage = false;
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws);
    expect(state.camX).toBe(40);
    expect(state.camY).toBe(40);

    // Player pans away, then the socket reconnects and a second INIT arrives.
    state.camX = 900;
    state.camY = -200;
    sendInit(ws);

    expect(state.camX).toBe(900);
    expect(state.camY).toBe(-200);
  });
});

// Regression: when a player returns after a season has rolled over, the stored
// camera location from the old season should be discarded and the camera
// centered on the home tile — otherwise they see darkness.
let storage: Map<string, string>;

const sendInitWithSeason = (ws: FakeWebSocket, seasonId: string): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 } },
      config: { season: { seasonId, worldSeed: 12345 } },
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

describe("INIT clears stale camera on season change", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
  });

  it("clears persisted camera and centers on home tile when season changed", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40 }));

    const state = createState();
    state.camX = 500;
    state.camY = 300;
    state.cameraRestoredFromStorage = true;
    state.bridgeDebugSeasonId = "season-1";
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInitWithSeason(ws, "season-2");

    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(false);
    expect(state.cameraRestoredFromStorage).toBe(false);
    expect(state.camX).toBe(40);
    expect(state.camY).toBe(40);
  });

  it("preserves camera when season has not changed", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40 }));

    const state = createState();
    state.camX = 500;
    state.camY = 300;
    state.cameraRestoredFromStorage = true;
    state.bridgeDebugSeasonId = "season-1";
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInitWithSeason(ws, "season-1");

    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(true);
    expect(state.camX).toBe(500);
    expect(state.camY).toBe(300);
  });

  // Regression for issue #8 (reload-after-rollover scenario): when a player
  // reloads their browser AFTER a season has already rolled over on the
  // server, bridgeDebugSeasonId is "" (in-memory-only, reset every reload) —
  // it can't detect the change by itself. The stored camera payload is
  // tagged with the season it was saved under (cameraRestoredSeasonId, read
  // via cameraLocationInitialState() at state-creation time), which is what
  // actually lets the INIT handler notice the old season is stale.
  it("clears persisted camera on first load in a new season (reload-after-rollover scenario)", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40, seasonId: "season-1" }));

    const state = createState(); // reads storage above: cameraRestoredSeasonId = "season-1"
    state.camX = 500;
    state.camY = 300;
    state.cameraRestoredFromStorage = true;
    // bridgeDebugSeasonId is "" on a genuine fresh page load — never force it here.

    const ws = new FakeWebSocket();
    bind(state, ws);

    // Player receives INIT with new seasonId (season has rolled over on server)
    sendInitWithSeason(ws, "season-2");

    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(false);
    expect(state.cameraRestoredFromStorage).toBe(false);
    // Camera should center on home tile, not the stale season-1 coordinates.
    expect(state.camX).toBe(40);
    expect(state.camY).toBe(40);
  });

  // The critical counterpart to the test above: a ordinary page reload
  // within the SAME season must NOT wipe the restored camera. A prior
  // version of the season-change guard only checked bridgeDebugSeasonId,
  // which is "" on every fresh load regardless of whether the season
  // actually changed — that treated every single reload as a season change
  // and silently broke the "restore last-viewed position" feature entirely.
  it("preserves camera on first load when the season has NOT changed (fresh reload, same season)", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40, seasonId: "season-1" }));

    const state = createState(); // reads storage above: cameraRestoredSeasonId = "season-1"
    state.camX = 500;
    state.camY = 300;
    state.cameraRestoredFromStorage = true;
    // bridgeDebugSeasonId is "" on a genuine fresh page load — never force it here.

    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInitWithSeason(ws, "season-1"); // same season as the stored payload

    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(true);
    expect(state.cameraRestoredFromStorage).toBe(true);
    expect(state.camX).toBe(500);
    expect(state.camY).toBe(300);
  });

  // A save made before this seasonId-tagging existed (or camera storage
  // otherwise missing a season tag) has nothing safe to compare against.
  // Defaulting to "preserve" here matches pre-existing behavior for that
  // narrow migration window rather than risking false-positive clears.
  it("preserves camera on first load when the stored payload has no season tag", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40 }));

    const state = createState();
    state.camX = 500;
    state.camY = 300;
    state.cameraRestoredFromStorage = true;

    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInitWithSeason(ws, "season-2");

    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(true);
    expect(state.camX).toBe(500);
    expect(state.camY).toBe(300);
  });
});
