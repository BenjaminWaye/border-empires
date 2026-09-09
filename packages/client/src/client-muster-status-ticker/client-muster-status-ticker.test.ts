import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMusterStatusTicker } from "./client-muster-status-ticker.js";
import type { ClientState } from "../client-state/client-state.js";

const makeState = (overrides: Partial<ClientState> = {}): ClientState =>
  ({
    activePanel: "manpower",
    mobilePanel: "core",
    me: "me",
    tiles: new Map(),
    ...overrides
  }) as unknown as ClientState;

describe("startMusterStatusTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-renders once a second while the panel is open and a HOLD flag is out (dropped the mode !== HOLD guard so HOLD flags animate too)", () => {
    const state = makeState({
      tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "me", muster: { ownerId: "me", amount: 10, mode: "HOLD", updatedAt: 0 } }]])
    });
    const renderHud = vi.fn();
    startMusterStatusTicker(state, renderHud);

    vi.advanceTimersByTime(1_000);
    expect(renderHud).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000);
    expect(renderHud).toHaveBeenCalledTimes(2);
  });

  it("does not re-render when the panel isn't open", () => {
    const state = makeState({
      activePanel: null,
      mobilePanel: "core",
      tiles: new Map([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "me", muster: { ownerId: "me", amount: 10, mode: "HOLD", updatedAt: 0 } }]])
    });
    const renderHud = vi.fn();
    startMusterStatusTicker(state, renderHud);

    vi.advanceTimersByTime(3_000);
    expect(renderHud).not.toHaveBeenCalled();
  });

  it("does not re-render when the player has no muster flags out", () => {
    const state = makeState({ tiles: new Map() });
    const renderHud = vi.fn();
    startMusterStatusTicker(state, renderHud);

    vi.advanceTimersByTime(3_000);
    expect(renderHud).not.toHaveBeenCalled();
  });
});
