// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasWaystationActivationBeenShown,
  markWaystationActivationSeen,
  notifyWaystationActivationEventLogEntry,
  notifyWaystationActivationsFromEventLog
} from "./client-waystation-activation-catchup.js";
import type { ClientEventLogEntry } from "../client-event-log-html.js";

const activationEntry = (id: string, x: number, y: number): ClientEventLogEntry => ({
  id,
  type: "WAYSTATION_ACTIVATED",
  text: "A waystation you own bolstered your resource stockpiles.",
  occurredAt: 1_000,
  x,
  y,
  grantedEffect: "RESOURCE_SLOT",
  grantedResource: "FOOD"
});

describe("notifyWaystationActivationEventLogEntry", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // Regression for: waystation activation lands while the player is offline
  // (auto-settle) or via a device other than the one they next open -- the
  // live TILE_DELTA_BATCH popup only reaches a client connected at that
  // exact moment. The server now records a durable WAYSTATION_ACTIVATED
  // eventLog entry (delivered on every INIT/reconnect, any device), and this
  // module turns an unseen one into the same popup.
  it("shows the activation popup for an unseen WAYSTATION_ACTIVATED entry", () => {
    const state = { me: "player-1" };
    const showOverlay = vi.fn();
    notifyWaystationActivationEventLogEntry(activationEntry("evt-1", 4, 5), state, {
      techCatalog: [],
      onJumpToLocation: vi.fn(),
      showOverlay
    });
    expect(showOverlay).toHaveBeenCalledTimes(1);
    expect(showOverlay.mock.calls[0]![0]).toMatchObject({ x: 4, y: 5, grantedEffect: "RESOURCE_SLOT", grantedResource: "FOOD" });
  });

  it("does not re-show a waystation already marked seen by the live path", () => {
    const state = { me: "player-1" };
    markWaystationActivationSeen(state, 4, 5);
    const showOverlay = vi.fn();
    notifyWaystationActivationEventLogEntry(activationEntry("evt-1", 4, 5), state, {
      techCatalog: [],
      onJumpToLocation: vi.fn(),
      showOverlay
    });
    expect(showOverlay).not.toHaveBeenCalled();
  });

  it("does not re-show the same activation twice across separate calls (e.g. resent on a later INIT)", () => {
    const state = { me: "player-1" };
    const showOverlay = vi.fn();
    const entry = activationEntry("evt-1", 40, 50);
    notifyWaystationActivationEventLogEntry(entry, state, { techCatalog: [], onJumpToLocation: vi.fn(), showOverlay });
    notifyWaystationActivationEventLogEntry(entry, state, { techCatalog: [], onJumpToLocation: vi.fn(), showOverlay });
    expect(showOverlay).toHaveBeenCalledTimes(1);
  });

  it("ignores non-waystation event types", () => {
    const state = { me: "player-1" };
    const showOverlay = vi.fn();
    notifyWaystationActivationEventLogEntry(
      { id: "evt-2", type: "TOWN_LOST", text: "Lost a town", occurredAt: 1_000, x: 1, y: 1 },
      state,
      { techCatalog: [], onJumpToLocation: vi.fn(), showOverlay }
    );
    expect(showOverlay).not.toHaveBeenCalled();
  });
});

describe("notifyWaystationActivationsFromEventLog", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows a popup for each unseen activation in a batch", () => {
    const state = { me: "player-1" };
    const showOverlay = vi.fn();
    notifyWaystationActivationsFromEventLog(
      [activationEntry("evt-1", 1, 1), activationEntry("evt-2", 2, 2), { id: "evt-3", type: "TOWN_LOST", text: "x", occurredAt: 1_000 }],
      state,
      { techCatalog: [], onJumpToLocation: vi.fn(), showOverlay }
    );
    expect(showOverlay).toHaveBeenCalledTimes(2);
  });
});

describe("hasWaystationActivationBeenShown", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // Regression for: the live TILE_DELTA_BATCH popup path used to have no way
  // to check this, so it could show a second popup for an activation the
  // eventLog catch-up path already displayed (a race when both signals
  // arrive for the same activation while the player is online).
  it("reflects markWaystationActivationSeen immediately", () => {
    const state = { me: "player-1" };
    expect(hasWaystationActivationBeenShown(state, 7, 8)).toBe(false);
    markWaystationActivationSeen(state, 7, 8);
    expect(hasWaystationActivationBeenShown(state, 7, 8)).toBe(true);
  });

  it("reflects a popup already shown via the eventLog catch-up path", () => {
    const state = { me: "player-1" };
    notifyWaystationActivationEventLogEntry(activationEntry("evt-1", 9, 9), state, { techCatalog: [], onJumpToLocation: vi.fn(), showOverlay: vi.fn() });
    expect(hasWaystationActivationBeenShown(state, 9, 9)).toBe(true);
  });
});
