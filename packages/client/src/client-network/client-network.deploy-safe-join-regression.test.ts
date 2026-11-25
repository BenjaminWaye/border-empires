import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, bindWithDeps } from "./client-network.error-regression.test-helpers.js";
import { createInitialState } from "../client-state/client-state.js";

// Regression (2026-11-25 playtest): a new player who signed in while staging
// restarted for a deploy saw "Connection interrupted — The realtime
// connection to wss://… failed before sign-in finished. Reload the game to
// reconnect." and had to reload by hand. A first sign-in must instead show a
// terse waiting state and reopen the socket on its own.
class ReconnectingSocket extends FakeWebSocket {
  readonly CONNECTING = 0;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly reconnect = vi.fn(() => {
    this.readyState = this.CONNECTING;
  });
  readonly close = vi.fn();
}

const createFirstSignInState = () =>
  ({
    ...createInitialState(),
    playerVisualStyles: new Map<string, unknown>(),
    hasEverInitialized: false,
    connection: "connecting",
    authConfigured: true,
    authReady: true,
    authSessionReady: false
  }) as any;

describe("first sign-in during a deploy restart", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const kind of ["error", "close"] as const) {
    it(`waits and reconnects in place after a socket ${kind} before the first INIT`, () => {
      vi.useFakeTimers();
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.stubGlobal("window", {
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        location: { reload: vi.fn() }
      });
      const state = createFirstSignInState();
      const ws = new ReconnectingSocket();
      const setAuthStatus = vi.fn();
      bindWithDeps(state, ws, { setAuthStatus });

      ws.readyState = ws.CLOSED;
      ws.emit(kind, kind === "close" ? { code: 1006, reason: "", wasClean: false } : {});

      expect(state.authBusy).toBe(true);
      expect(state.authBusyTitle).toBe("Server updating");
      expect(state.authBusyDetail).toBe("Reconnecting…");
      const shown = setAuthStatus.mock.calls.map((call) => String(call[0])).join("\n");
      expect(shown).not.toMatch(/ws:\/\/|wss:\/\/|Reload/);
      expect(setAuthStatus).not.toHaveBeenCalledWith(expect.anything(), "error");

      vi.runOnlyPendingTimers();
      expect(ws.reconnect).toHaveBeenCalledTimes(1);
    });
  }
});
