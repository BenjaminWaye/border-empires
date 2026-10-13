import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Group } from "three";
import { describe, expect, it } from "vitest";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield-terrain.js";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight } from "../client-map-3d-hill-shape.js";
import { hillFootprintTopY } from "../client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";
import type { Tile } from "../client-types.js";
import { HATCH_COLLAR_HEIGHT, type TownSupportTileOverlay } from "./client-map-3d-town-support-tile.js";
import { createTownSupportTileSync } from "./client-map-3d-town-support-tile-sync.js";

const identity = (v: number): number => v;
const allHills = (): boolean => true;
const GROUND_Y = 0.1;
const HALF = 0.18;

const domeYAt = (wx: number, wy: number, u: number, v: number): number =>
  GROUND_Y + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(u, v, hillBumpsWithCorridorAt(wx, wy, hillNeighborFlagsAt(wx, wy, allHills, identity, identity)), wx, wy);

const topFor = (wx: number, wy: number, isHillsAt: (x: number, y: number) => boolean, hillCut?: { readonly afcPads: readonly { du: number; dv: number }[] }): number =>
  hillFootprintTopY({ cornerYAt: () => GROUND_Y, wx, wy, wxNext: wx + 1, wyNext: wy + 1, rise: 0, halfExtent: HALF, isHillsAt, wrapX: identity, wrapY: identity, hillCut });

const grid = (n: number): number[] => Array.from({ length: n }, (_, i) => -1 + (2 * i) / (n - 1));

describe("town support hatch seating on hills", () => {
  it("seats the hatch rim on the dome instead of at ground level, where the dome buried it (regression)", () => {
    let raisedTiles = 0;
    for (let wx = 10; wx < 30; wx += 1) {
      for (let wy = 10; wy < 30; wy += 1) {
        const top = topFor(wx, wy, allHills);
        // The frame's underside sits 0.029 above the seat; nothing under it may poke through.
        for (const su of grid(9)) for (const sv of grid(9)) expect(top + 0.029).toBeGreaterThanOrEqual(domeYAt(wx, wy, su * HALF, sv * HALF));
        if (top > GROUND_Y + 0.05) raisedTiles += 1;
      }
    }
    // The old max-of-corners height was GROUND_Y: every one of these hatches was under the dome.
    expect(raisedTiles).toBe(400);
  });

  it("keeps the collar reaching below the lowest dome point under the frame, so no gap shows on a slope", () => {
    const collarBottomBelowSeat = HATCH_COLLAR_HEIGHT - 0.03;
    for (let wx = 10; wx < 30; wx += 1) {
      for (let wy = 10; wy < 30; wy += 1) {
        const top = topFor(wx, wy, allHills);
        let lowest = Infinity;
        for (const su of grid(7)) for (const sv of grid(7)) lowest = Math.min(lowest, domeYAt(wx, wy, su * 0.17, sv * 0.17));
        expect(top - lowest).toBeLessThan(collarBottomBelowSeat);
      }
    }
  });

  it("is the plain max-of-corners height off hills and follows the hill cut on hills", () => {
    expect(topFor(5, 5, () => false)).toBe(GROUND_Y);
    expect(topFor(5, 5, allHills, { afcPads: [{ du: 0, dv: 0 }] })).toBe(GROUND_Y);
  });

  it("caches each plot's seat until the next terrain rebuild hands out a new hill cut", () => {
    const seats: number[] = [];
    const overlay: TownSupportTileOverlay = {
      group: new Group(), clear: () => { seats.length = 0; }, commit: () => undefined, dispose: () => undefined,
      addInstance: (_x, _z, surfaceY) => { seats.push(surfaceY); }
    };
    const town = { x: 20, y: 20, ownerId: "me", ownershipState: "SETTLED", town: { populationTier: "TOWN" } } as unknown as Tile;
    let groundY = 0.1;
    let hillCutAt = (): undefined => undefined;
    const sync = createTownSupportTileSync({
      overlay, selected: () => ({ x: 20, y: 20 }), sceneOrigin: { camX: 20, camY: 20 }, toroidDelta: (from, to) => to - from,
      worldWidth: 100, worldHeight: 100, cornerYAt: () => groundY, isHillsAt: () => false, hillCutAt: () => hillCutAt, rise: 0,
      lookupDeps: { tiles: new Map([["20,20", town]]), keyFor: (x, y) => `${x},${y}`, wrapX: identity, wrapY: identity, terrainAt: () => "LAND", me: "me" }
    });
    sync();
    expect(seats).toHaveLength(8);
    expect(new Set(seats)).toEqual(new Set([0.1]));
    groundY = 0.3; // terrain moved, but no rebuild yet: cached seats stay
    sync();
    expect(new Set(seats)).toEqual(new Set([0.1]));
    hillCutAt = (): undefined => undefined; // a rebuild hands out a fresh lookup
    sync();
    expect(new Set(seats)).toEqual(new Set([0.3]));
  });

  it("is wired into the true-3D map with the latest rebuild's hill cut", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const mapSource = readFileSync(resolve(here, "../client-map-3d/client-map-3d.ts"), "utf8");
    expect(mapSource).toContain("const syncTownSupportTiles = createTownSupportTileSync({");
    expect(mapSource).toContain("hillCutAt: () => latestHillCutAt");
    expect(mapSource).toContain("latestHillCutAt = hillCutAt;");
  });
});
