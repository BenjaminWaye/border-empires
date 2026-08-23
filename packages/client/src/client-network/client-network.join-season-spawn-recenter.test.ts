import { beforeEach, describe, expect, it, vi } from "vitest";

import { CAMERA_LOCATION_STORAGE_KEY } from "../client-constants.js";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

// Regression: a player joining a live season mid-session (JOIN_SEASON, not a
// fresh page load) spawned territory but the camera never recentered on it.
// state.homeTile is otherwise only ever set by the INIT handler, and no
// second INIT is sent after JOIN_SEASON_ACK, so a live spawn left the camera
// (and localStorage's persisted camera) stuck wherever the player was
// panning pre-spawn -- see handle-join-season-message.ts on the gateway and
// centerOnOwnedTile()/clearCameraLocation() in client-view-refresh.ts.
//
// Real report: settlement spawned at tile (155,227) but localStorage camera
// held {x:430, y:250, zoom:69, seasonId:"season-8"}.

let storage: Map<string, string>;

describe("JOIN_SEASON_ACK recenters the camera on a live spawn", () => {
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

  it("moves the camera to spawnTile, sets homeTile, and clears the stale persisted camera", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 430, y: 250, zoom: 69, seasonId: "season-8" }));

    const state = createState();
    state.camX = 430;
    state.camY = 250;
    state.homeTile = undefined;
    state.needsSeasonJoin = true;
    state.joinSeasonPending = true;
    state.joinSeasonOverlayOpen = true;

    const ws = new FakeWebSocket();
    const { requestViewRefresh } = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({ type: "JOIN_SEASON_ACK", spawned: true, spawnTile: { x: 155, y: 227 } })
    });

    expect(state.homeTile).toEqual({ x: 155, y: 227 });
    expect(state.camX).toBe(155);
    expect(state.camY).toBe(227);
    expect(state.needsSeasonJoin).toBe(false);
    expect(state.joinSeasonOverlayOpen).toBe(false);
    // Stale pre-spawn camera must be cleared, not left to be restored on reload.
    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(false);
    // Must re-subscribe chunks around the new camera position, forced past cooldown.
    expect(requestViewRefresh).toHaveBeenCalledWith(undefined, true);
  });

  it("does not touch the camera when the ack has no spawnTile (e.g. rejoin, not a fresh spawn)", () => {
    const state = createState();
    state.camX = 430;
    state.camY = 250;
    state.homeTile = undefined;

    const ws = new FakeWebSocket();
    const { requestViewRefresh } = bindWithDeps(state, ws);

    ws.emit("message", { data: JSON.stringify({ type: "JOIN_SEASON_ACK", spawned: true }) });

    expect(state.homeTile).toBeUndefined();
    expect(state.camX).toBe(430);
    expect(state.camY).toBe(250);
    expect(requestViewRefresh).not.toHaveBeenCalled();
  });

  it("does not touch the camera when spawned is false", () => {
    const state = createState();
    state.camX = 430;
    state.camY = 250;

    const ws = new FakeWebSocket();
    const { requestViewRefresh } = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({ type: "JOIN_SEASON_ACK", spawned: false, spawnTile: { x: 155, y: 227 } })
    });

    expect(state.camX).toBe(430);
    expect(state.camY).toBe(250);
    expect(requestViewRefresh).not.toHaveBeenCalled();
  });
});
