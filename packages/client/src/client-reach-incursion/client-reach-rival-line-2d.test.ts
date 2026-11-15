import { describe, expect, it } from "vitest";

import type { IncursionTile } from "./client-reach-incursion.js";
import { drawRivalReachLine2D, rivalReachEdges } from "./client-reach-rival-line-2d.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const depsFor = (tiles: Record<string, IncursionTile>) => ({ tiles: new Map(Object.entries(tiles)), keyFor, wrapX: (x: number) => x, wrapY: (y: number) => y });

// Playtest 2026-11-13 (pt-strategist): a neighbour whose land was out of sight
// showed only an "Inside Linnea Reach" label; the 3D map drew rival reach
// pylons but the 2D map drew no rival reach line at all.
describe("rival reach line on the 2D map", () => {
  it("marks the sides of a rival's reach that face ground outside it", () => {
    const tiles: Record<string, IncursionTile> = { "5,5": { terrain: "LAND", ownerId: "me", reachOwnerId: "ai-2" }, "6,5": { terrain: "LAND", reachOwnerId: "ai-2" }, "4,5": { terrain: "LAND", reachOwnerId: "me" } };
    expect(rivalReachEdges(tiles["5,5"]!, 5, 5, "me", depsFor(tiles))).toEqual({ ownerId: "ai-2", edges: { north: true, east: false, south: true, west: true } });
  });

  it("draws nothing for my own reach, barbarians, water, or a tile inside the rival's reach on every side", () => {
    expect(rivalReachEdges({ terrain: "LAND", reachOwnerId: "me" }, 0, 0, "me", depsFor({}))).toBeUndefined();
    expect(rivalReachEdges({ terrain: "LAND", reachOwnerId: "barbarian-1" }, 0, 0, "me", depsFor({}))).toBeUndefined();
    expect(rivalReachEdges({ terrain: "SEA", reachOwnerId: "ai-2" }, 0, 0, "me", depsFor({}))).toBeUndefined();
    const inner: IncursionTile = { terrain: "LAND", reachOwnerId: "ai-2" };
    const tiles = { "1,0": inner, "-1,0": inner, "0,1": inner, "0,-1": inner };
    expect(rivalReachEdges(inner, 0, 0, "me", depsFor(tiles))).toBeUndefined();
  });

  it("strokes only the edge sides, in the rival's colour", () => {
    const calls: string[] = [];
    const ctx = {
      globalAlpha: 1, strokeStyle: "", lineWidth: 0, lineCap: "",
      save: () => undefined, restore: () => undefined, beginPath: () => undefined,
      moveTo: (x: number, y: number) => void calls.push(`M${x},${y}`), lineTo: (x: number, y: number) => void calls.push(`L${x},${y}`),
      stroke: () => void calls.push(`S${ctx.strokeStyle}`)
    };
    drawRivalReachLine2D(ctx as unknown as CanvasRenderingContext2D, { north: true, east: false, south: false, west: false }, "#ff0000", 0, 0, 32);
    expect(calls).toEqual(["M1,1", "L31,1", "S#ff0000"]);
  });
});
