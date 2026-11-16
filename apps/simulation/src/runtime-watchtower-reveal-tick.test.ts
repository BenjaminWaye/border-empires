import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import { activateWatchtowerAt, tickWatchtowerReveals, type PendingWatchtowerReveal, type WatchtowerRevealRuntimeInput } from "./runtime-watchtower-reveal-tick.js";
import { VisionTransitionAccumulator } from "./runtime-vision-transition.js";
import type { SimulationTileWireDelta } from "./runtime-types.js";

const footprintKeys = (x: number, y: number, radius: number): string[] => {
  const keys: string[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) keys.push(`${x + dx},${y + dy}`);
  return keys;
};

// Mirrors simulation-service.ts's TILE_DELTA_BATCH fanout, which takes the
// accumulated vision edges synchronously the moment an event is emitted.
const harness = () => {
  let nowMs = 1_000;
  const transitions = new VisionTransitionAccumulator();
  const tiles = new Map<string, DomainTileState>([["10,10", { x: 10, y: 10, terrain: "LAND", watchtower: { activated: false } } as DomainTileState]]);
  const pending: PendingWatchtowerReveal[] = [];
  const batches: Array<{ entered: number; left: number }> = [];
  const input: WatchtowerRevealRuntimeInput = {
    now: () => nowMs,
    tiles,
    pendingWatchtowerReveals: pending,
    visibilityCoverage: {
      addTemporaryReveal: (viewerId, x, y, radius, callbacks) => { for (const key of footprintKeys(x, y, radius)) callbacks?.onEnter?.(viewerId, key); },
      removeTemporaryReveal: (viewerId, x, y, radius, callbacks) => { for (const key of footprintKeys(x, y, radius)) callbacks?.onLeave?.(viewerId, key); }
    },
    visionTransitionCallbacks: transitions.callbacks,
    replaceTileState: (key, tile) => { tiles.set(key, tile); },
    emitEvent: (event: SimulationEvent) => {
      if (event.eventType !== "TILE_DELTA_BATCH") return;
      const taken = transitions.take();
      batches.push({ entered: taken.entered.get("p1")?.size ?? 0, left: taken.left.get("p1")?.size ?? 0 });
    },
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as SimulationTileWireDelta
  };
  return { input, batches, advance: (ms: number) => { nowMs += ms; return nowMs; } };
};

describe("watchtower reveal pulse", () => {
  it("ships the revealed tiles in the activation batch itself, not a later one", () => {
    const { input, batches } = harness();
    activateWatchtowerAt(input, "10,10", 10, 10, "p1", "cmd-1");
    expect(batches).toHaveLength(1);
    expect(batches[0]!.entered).toBeGreaterThan(0);
  });

  it("fogs (rather than silently drops) the revealed tiles when the pulse expires", () => {
    const { input, batches, advance } = harness();
    activateWatchtowerAt(input, "10,10", 10, 10, "p1", "cmd-1");
    tickWatchtowerReveals(input, advance(5_000));
    expect(batches).toHaveLength(1);
    tickWatchtowerReveals(input, advance(6_000));
    expect(batches).toHaveLength(2);
    expect(batches[1]!.left).toBe(batches[0]!.entered);
  });
});
