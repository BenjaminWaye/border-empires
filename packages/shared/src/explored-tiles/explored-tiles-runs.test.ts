import { describe, expect, it } from "vitest";

import { encodeExploredTilesRuns, forEachExploredTile } from "./explored-tiles-runs.js";

const bitsetFor = (width: number, height: number, cells: Array<[number, number]>): Uint8Array => {
  const bits = new Uint8Array(Math.ceil((width * height) / 8));
  for (const [x, y] of cells) {
    const index = y * width + x;
    bits[index >> 3] = (bits[index >> 3] ?? 0) | (1 << (index & 7));
  }
  return bits;
};

const decode = (value: unknown, width: number, height: number): string[] => {
  const keys: string[] = [];
  forEachExploredTile(value, width, height, (x, y) => keys.push(`${x},${y}`));
  return keys.sort();
};

describe("explored tile runs", () => {
  it("round-trips scattered and contiguous cells", () => {
    const cells: Array<[number, number]> = [[0, 0], [1, 0], [2, 0], [9, 0], [0, 1], [5, 3], [6, 3], [9, 4]];
    const encoded = encodeExploredTilesRuns(bitsetFor(10, 5, cells), 10, 5);
    expect(decode(encoded, 10, 5)).toEqual(cells.map(([x, y]) => `${x},${y}`).sort());
  });

  it("encodes an empty map as no runs and a full map as one explored run", () => {
    expect(encodeExploredTilesRuns(new Uint8Array(7), 10, 5).runs).toEqual([]);
    const full = new Uint8Array(7).fill(255);
    expect(encodeExploredTilesRuns(full, 10, 5).runs).toEqual([0, 50]);
  });

  it("keeps a contiguous region small", () => {
    const cells: Array<[number, number]> = [];
    for (let y = 10; y < 30; y += 1) for (let x = 40; x < 80; x += 1) cells.push([x, y]);
    const encoded = encodeExploredTilesRuns(bitsetFor(640, 320, cells), 640, 320);
    expect(encoded.runs.length).toBe(40);
  });

  it("ignores a record written for another world size or malformed runs", () => {
    const encoded = encodeExploredTilesRuns(bitsetFor(10, 5, [[1, 1]]), 10, 5);
    expect(forEachExploredTile(encoded, 20, 5, () => undefined)).toBe(false);
    expect(forEachExploredTile({ width: 10, height: 5, runs: [3, -1] }, 10, 5, () => undefined)).toBe(false);
    expect(forEachExploredTile(undefined, 10, 5, () => undefined)).toBe(false);
  });
});
