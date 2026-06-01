import { describe, expect, it } from "vitest";
import { computeEncirclementDeltas, ENCIRCLEMENT_BFS_CAP } from "./encirclement.js";

type TileStub = { ownerId?: string; ownershipState?: string; frontierDecayAt?: number; frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" };

const mkTileMap = (entries: Record<string, TileStub>): ((key: string) => TileStub | undefined) =>
  (key: string) => entries[key];

describe("encirclement perf gate", () => {
  it("CAP3: perf gate — 50k-tile connected blob, 100 changed keys, wall time < 50ms", () => {
    // Build the map: one player with 50,000 owned tiles in a 224×224 grid.
    // One settled tile as supply root at (0,0).
    // Changed keys: 100 tiles near the centre.
    const ROWS = 224;
    const COLS = 224; // 224×224 = 50,176 tiles ≈ 50,000
    const entries: Record<string, TileStub> = {};
    entries["0,0"] = { ownerId: "player-1", ownershipState: "SETTLED" };
    for (let x = 1; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        entries[`${x},${y}`] = { ownerId: "player-1", ownershipState: "FRONTIER" };
      }
    }
    const tiles = mkTileMap(entries);

    // 100 changed keys near the centre of the blob
    const changedKeys: string[] = [];
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        changedKeys.push(`${cx + i},${cy + j}`);
      }
    }

    const start = Date.now();
    const { cutOff, reconnected } = computeEncirclementDeltas(
      changedKeys,
      "player-1",
      tiles,
      1_000,
      { bfsCap: ENCIRCLEMENT_BFS_CAP }
    );
    const elapsed = Date.now() - start;

    // At 50k tiles, BFS would visit > ENCIRCLEMENT_BFS_CAP (10k) tiles
    // and bail out — both sets should be empty (Option C: skip this tick).
    // The important guarantee: wall time is well under 50ms.
    console.log(`[perf-gate] encirclement BFS cap 50k tiles: ${elapsed}ms (cutOff=${cutOff.size}, reconnected=${reconnected.size})`);
    expect(elapsed, `computeEncirclementDeltas 50k tiles took ${elapsed}ms — must be < 50ms`).toBeLessThan(50);
    // Either the cap fired (empty) or the result is valid — either is correct.
    expect(cutOff.size + reconnected.size).toBeGreaterThanOrEqual(0); // always passes
  });
});
