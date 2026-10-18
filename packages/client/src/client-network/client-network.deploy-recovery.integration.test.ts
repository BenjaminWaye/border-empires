import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "firebase/auth";
import { createSocketAuthenticator } from "../client-auth-flow/client-authenticate-socket.js";
import { bind, FakeWebSocket } from "../client-network-init-message/client-network-test-harness.js";
import { createInitialState } from "../client-state/client-state.js";

class RecoverySocket extends FakeWebSocket {
  readonly CONNECTING = 0;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly send = vi.fn<(data: string) => void>();
  readonly close = vi.fn();
  readonly reconnect = vi.fn(() => { this.readyState = this.CONNECTING; });
  readonly removeEventListener = vi.fn();

  drop(): void {
    this.readyState = this.CLOSED;
    this.emit("close", { code: 1006, reason: "", wasClean: false });
  }

  open(): void {
    this.readyState = this.OPEN;
    this.emit("open", {});
  }

  message(payload: object): void {
    this.emit("message", { data: JSON.stringify(payload) });
  }
}

describe("deployment recovery through the real client authenticator", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      location: { reload, search: "", pathname: "/" }
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    reload.mockClear();
  });

  it.each(["SERVER_STARTING", "SERVER_BUSY", "AUTH_UNAVAILABLE", "AUTH_FAIL"])(
    "reauthenticates after %s and restores the empire without a refresh",
    async (code) => {
      const state = createInitialState();
      Object.assign(state, {
        hasEverInitialized: true, authReady: true, authSessionReady: true,
        connection: "initialized", firstChunkAt: 1, me: "player-1",
        camX: 40, camY: 50, selected: { x: 41, y: 50 },
        manpower: 500, manpowerCap: 720, bridgeDebugSeasonId: "season-test"
      });
      const ws = new RecoverySocket();
      const getIdToken = vi.fn(async () => "firebase-token");
      const firebaseAuth = { currentUser: { uid: "uid-1", getIdToken } } as unknown as Auth;
      const authenticator = createSocketAuthenticator(firebaseAuth, ws, {
        token: "", uid: "", emailLinkSentTo: "", emailLinkPending: false
      });
      const sendGameMessage = vi.fn();
      bind(state, ws, { firebaseAuth, ...authenticator, sendGameMessage });

      ws.message({ type: "SERVER_DEPLOYING" });
      ws.drop();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(ws.reconnect).toHaveBeenCalledTimes(1);
      ws.open();
      await vi.advanceTimersByTimeAsync(0);
      expect(ws.send).toHaveBeenCalledTimes(1);

      ws.message({ type: "ERROR", code, message: "Server is still starting" });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(ws.send).toHaveBeenCalledTimes(2);
      expect(JSON.parse(ws.send.mock.calls[1]![0])).toMatchObject({ type: "AUTH", token: "firebase-token" });
      if (code === "AUTH_FAIL") expect(getIdToken).toHaveBeenLastCalledWith(true);

      ws.message({
        type: "INIT",
        player: { id: "player-1", name: "Waypoint", manpower: 0, manpowerCap: 2832 },
        config: { season: { seasonId: "season-test" } },
        recovery: { nextClientSeq: 8, pendingCommands: [{
          commandId: "pending-7", clientSeq: 7, type: "ATTACK", status: "ACCEPTED",
          payload: { fromX: 41, fromY: 50, toX: 42, toY: 50 }
        }] },
        initialState: { tiles: [{
          x: 41, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          musterJson: JSON.stringify({ ownerId: "player-1", mode: "HOLD", amount: 94 })
        }] }
      });

      expect(state.connection).toBe("initialized");
      expect(state.authSessionReady).toBe(true);
      expect(state.serverDeploying).toBe(false);
      expect([state.manpower, state.manpowerCap]).toEqual([0, 2832]);
      expect(state.tiles.get("41,50")?.muster?.amount).toBe(94);
      expect(state.actionCurrent).toMatchObject({ commandId: "pending-7", x: 42, y: 50 });
      expect([state.camX, state.camY, state.selected]).toEqual([40, 50, { x: 41, y: 50 }]);
      expect(sendGameMessage.mock.calls.some(([payload]) =>
        ["ATTACK", "EXPAND", "SET_MUSTER"].includes(payload.type)
      )).toBe(false);
      expect(reload).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(70_000);
      expect(ws.reconnect).toHaveBeenCalledTimes(1);

      // Only the completed INIT resets backoff for a later outage.
      ws.drop();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(ws.reconnect).toHaveBeenCalledTimes(2);
    }
  );

  it("reopens a connection that opens but never restores the session", async () => {
    const state = createInitialState();
    state.hasEverInitialized = true;
    state.authSessionReady = true;
    const ws = new RecoverySocket();
    const authenticator = createSocketAuthenticator(undefined, ws, {
      token: "", uid: "", emailLinkSentTo: "", emailLinkPending: false
    }, "player-1");
    bind(state, ws, authenticator);

    ws.drop();
    await vi.advanceTimersByTimeAsync(2_000);
    ws.open();
    expect(ws.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(64_000);

    expect(ws.reconnect).toHaveBeenCalledTimes(2);
    ws.open();
    expect(ws.send).toHaveBeenCalledTimes(2);
    expect(state.connection).toBe("connected");
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits while queue and INIT-download progress are still arriving", async () => {
    const state = createInitialState();
    state.hasEverInitialized = true;
    state.authSessionReady = true;
    const ws = new RecoverySocket();
    bind(state, ws);
    ws.drop();
    await vi.advanceTimersByTimeAsync(2_000);
    ws.open();

    for (const type of ["LOGIN_PHASE", "LOGIN_QUEUED", "LOGIN_QUEUE_PROGRESS", "initprogress"]) {
      await vi.advanceTimersByTimeAsync(50_000);
      if (type === "initprogress") ws.emit("initprogress", {});
      else ws.message({ type, title: "Preparing your empire", position: 1 });
      expect(ws.reconnect).toHaveBeenCalledTimes(1);
    }
    await vi.advanceTimersByTimeAsync(59_999);
    expect(ws.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4_001);
    expect(ws.close).toHaveBeenCalledWith(4000, "reconnect_timeout");
    expect(ws.reconnect).toHaveBeenCalledTimes(2);
  });

  it("recovers a connection attempt that never opens or closes", async () => {
    const state = createInitialState();
    state.hasEverInitialized = true;
    const ws = new RecoverySocket();
    bind(state, ws);
    ws.drop();
    await vi.advanceTimersByTimeAsync(66_000);
    expect(ws.reconnect).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });
});
