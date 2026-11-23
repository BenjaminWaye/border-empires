import { describe, expect, it } from "vitest";
import type { Terrain } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { VisibilityCoverageTracker } from "./visibility-coverage-cache.js";
import { createVisionFootprintTableForRuntime } from "./vision-footprint-table.js";
import { tickWatchtowerReveals, type PendingWatchtowerReveal, type WatchtowerRevealRuntimeInput } from "./runtime-watchtower-reveal-tick.js";

// Regression (review of the 2026-11-23 waystation VISION fix): expiry used to
// re-derive the footprint from (x, y, radius). A mountain created or removed
// in range during the look changed that footprint, so cells behind a new
// mountain kept their count forever -- permanent sight, the bug being fixed --
// or a removed mountain fogged cells another source still covered. The 5-min
// look made that window 30x the old 10 s watchtower pulse. Expiry now removes
// exactly the cells it added. The removed-mountain case is the one that failed
// before; the raised-mountain case guards the other direction (today a cached
// plain footprint hides it, so it can't fail on the old code).
const W = 64;
const H = 64;

const setup = () => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: "LAND" });
  let epoch = 0;
  const table = createVisionFootprintTableForRuntime(W, H, () => tiles, () => epoch);
  const coverage = new VisibilityCoverageTracker(W, H, {
    visionRadiusForPlayer: () => 1,
    getPlayer: () => ({ id: "player-1", isAi: false, allies: new Set<string>() }) as never,
    settledTileKeysForPlayer: () => new Set(),
    frontierTileKeysForPlayer: () => new Set()
  }, table);
  const setTerrain = (x: number, y: number, terrain: Terrain): void => {
    tiles.set(`${x},${y}`, { x, y, terrain });
    epoch += 1;
  };
  const pending: PendingWatchtowerReveal[] = [];
  const input: WatchtowerRevealRuntimeInput = {
    now: () => 0,
    tiles,
    pendingWatchtowerReveals: pending,
    visibilityCoverage: coverage,
    visionTransitionCallbacks: {},
    replaceTileState: (key, tile) => { tiles.set(key, tile); },
    emitEvent: () => {},
    tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }) as never
  };
  return { coverage, setTerrain, pending, input };
};

describe("tickWatchtowerReveals", () => {
  it("leaves no cell in sight when a mountain is raised inside the look before it expires", () => {
    const { coverage, setTerrain, pending, input } = setup();
    const cellKeys = coverage.addTemporaryRevealCells("player-1", 30, 30, 5, {});
    pending.push({ kind: "waystation-vision", tileKey: "20,30", playerId: "player-1", expiresAt: 100, cellKeys });
    expect(coverage.isVisible("player-1", "34,30")).toBe(true);

    // A rival raises a mountain between the town and the far cells mid-look.
    setTerrain(32, 30, "MOUNTAIN");
    tickWatchtowerReveals(input, 100);

    for (const key of cellKeys) expect(coverage.isVisible("player-1", key)).toBe(false);
    expect(pending).toHaveLength(0);
  });

  it("does not fog cells another source still covers when a mountain is removed inside the look", () => {
    const { coverage, setTerrain, pending, input } = setup();
    setTerrain(32, 30, "MOUNTAIN");
    const cellKeys = coverage.addTemporaryRevealCells("player-1", 30, 30, 5, {});
    // Another source keeps (34, 30)'s neighbourhood in sight the whole time.
    const other = coverage.addTemporaryRevealCells("player-1", 34, 30, 1, {});
    expect(cellKeys).not.toContain("34,30");

    setTerrain(32, 30, "LAND");
    pending.push({ kind: "watchtower", tileKey: "30,30", playerId: "player-1", expiresAt: 100, cellKeys });
    tickWatchtowerReveals(input, 100);

    for (const key of other) expect(coverage.isVisible("player-1", key)).toBe(true);
  });
});
