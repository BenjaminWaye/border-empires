import { describe, expect, it } from "vitest";

import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import {
  HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS,
  PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS,
  createPersistentAlertsFrame,
  type PersistentAlertsFrameDrawDeps
} from "./client-persistent-alerts-frame.js";

const noop = (): undefined => undefined;
const drawDeps: PersistentAlertsFrameDrawDeps = {
  ctx: new Proxy({}, { get: () => noop, set: () => true }) as unknown as CanvasRenderingContext2D,
  canvas: { width: 100, height: 100 } as HTMLCanvasElement,
  worldToScreen: (wx, wy) => ({ sx: 50 + (wx - 10) * 10, sy: 50 + (wy - 10) * 10 }),
  toroidDelta: (from, to) => to - from,
  size: 1,
  halfW: 0,
  halfH: 0
};

const ownTile: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
const enemyFlag: Tile = {
  x: 12,
  y: 10,
  terrain: "LAND",
  ownerId: "enemy",
  ownershipState: "SETTLED",
  muster: { ownerId: "enemy", amount: 80, mode: "ADVANCE", updatedAt: 0 }
};

const stateWithTiles = (tiles: Tile[]): ClientState => {
  const state = createInitialState();
  state.me = "me";
  for (const tile of tiles) state.tiles.set(`${tile.x},${tile.y}`, tile);
  return state;
};

// Steps past each recompute interval, so every call rescans.
const runFrames = (frame: ReturnType<typeof createPersistentAlertsFrame>, fromMs: number, toMs: number): void => {
  for (let t = fromMs; t <= toMs; t += PERSISTENT_ALERTS_RECOMPUTE_INTERVAL_MS) frame(t, drawDeps);
};

describe("createPersistentAlertsFrame hostile muster toast", () => {
  it("toasts an enemy flag that appears after the warm-up", () => {
    const state = stateWithTiles([ownTile]);
    const frame = createPersistentAlertsFrame(state);
    runFrames(frame, 1, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 1_000);
    expect(state.captureAlert).toBeUndefined();
    state.tiles.set("12,10", enemyFlag);
    runFrames(frame, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 1_220, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 1_500);
    expect(state.captureAlert).toMatchObject({ title: "Enemy muster flag near your border", tone: "error", focusX: 12, focusY: 10 });
  });

  it("does not toast a flag that was already there when the map loaded", () => {
    const state = stateWithTiles([ownTile, enemyFlag]);
    const frame = createPersistentAlertsFrame(state);
    runFrames(frame, 1, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS * 2);
    expect(state.captureAlert).toBeUndefined();
  });

  it("does not replace a toast that is still showing, and announces once it has expired", () => {
    const state = stateWithTiles([ownTile]);
    const frame = createPersistentAlertsFrame(state);
    runFrames(frame, 1, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 1_000);
    const combatToast = { title: "Attack won", detail: "", until: Date.now() + 60_000, tone: "success" as const };
    state.captureAlert = combatToast;
    state.tiles.set("12,10", enemyFlag);
    runFrames(frame, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 1_220, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 2_000);
    expect(state.captureAlert).toBe(combatToast);
    combatToast.until = Date.now() - 1;
    runFrames(frame, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 2_220, HOSTILE_MUSTER_ANNOUNCE_WARMUP_MS + 2_500);
    expect(state.captureAlert?.title).toBe("Enemy muster flag near your border");
  });
});
