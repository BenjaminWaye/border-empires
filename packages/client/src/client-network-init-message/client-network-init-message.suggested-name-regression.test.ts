import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "../client-network/client-network.js";
import { createInitialState } from "../client-state/client-state.js";

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

// Mirrors the fixture in client-network-init-message.integrity-pct-regression.test.ts.
const bind = (state: any, ws: FakeWebSocket) => {
  const mocks = {
    seedProfileSetupFields: vi.fn(),
    setAuthStatus: vi.fn(),
    syncAuthOverlay: vi.fn(),
    pushFeed: vi.fn(),
    authProfileColorEl: { value: "#123456" }
  };
  bindClientNetwork({
    state,
    ws: ws as unknown as WebSocket,
    wsUrl: "ws://localhost:3101/ws",
    keyFor: (x: number, y: number) => `${x},${y}`,
    renderHud: vi.fn(),
    setAuthStatus: mocks.setAuthStatus,
    syncAuthOverlay: mocks.syncAuthOverlay,
    authenticateSocket: vi.fn(async () => {}),
    sendGameMessage: vi.fn(),
    pushFeed: mocks.pushFeed,
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
    authProfileColorEl: mocks.authProfileColorEl,
    defensibilityPctFromTE: vi.fn(() => 50),
    seedProfileSetupFields: mocks.seedProfileSetupFields,
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
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue: vi.fn(),
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    applyOptimisticTileState: vi.fn()
  } as any);
  return mocks;
};

const sendInit = (ws: FakeWebSocket, player: Record<string, unknown>): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player", points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 }, ...player },
      config: {},
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

const sendError = (ws: FakeWebSocket, code: string, extra: Record<string, unknown> = {}): void => {
  ws.emit("message", { data: JSON.stringify({ type: "ERROR", code, message: `${code} happened`, ...extra }) });
};

describe("INIT profile name suggestion", () => {
  it("pre-fills the profile step with the server's free name instead of the placeholder name", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);

    sendInit(ws, { profileNeedsSetup: true, suggestedName: "House Ashgrove" });

    expect(mocks.seedProfileSetupFields).toHaveBeenCalledWith("House Ashgrove", expect.anything());
  });

  it("still seeds from the player's own name when the server sends no suggestion (a returning player)", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);

    sendInit(ws, { name: "Ada Lovelace" });

    expect(mocks.seedProfileSetupFields).toHaveBeenCalledWith("Ada Lovelace", expect.anything());
  });
});

describe("NAME_TAKEN error", () => {
  it("shows the message with the suggested name and leaves the colour the player picked alone", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);
    mocks.authProfileColorEl.value = "#abcdef";

    sendError(ws, "NAME_TAKEN", { suggestion: "House Ashgrove II" });

    expect(mocks.setAuthStatus).toHaveBeenCalledWith("NAME_TAKEN happened Try: House Ashgrove II", "error");
    expect(mocks.authProfileColorEl.value).toBe("#abcdef");
  });

  it("reports a rejected rename on the Settings feed and clears the pending change", () => {
    const state = createState();
    state.pendingDisplayNameChange = "House Vex";
    const ws = new FakeWebSocket();
    const mocks = bind(state, ws);

    sendError(ws, "NAME_TAKEN", { suggestion: "House Vex II" });

    expect(state.pendingDisplayNameChange).toBe("");
    expect(mocks.pushFeed).toHaveBeenCalledWith("Display name not updated: NAME_TAKEN happened Try: House Vex II", "error", "error");
  });
});
