import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: the 2D canvas loop (client-runtime-loop.ts) gives
// drawTileGround2D a neighbourVisibility lookup. tileVisibilityStateAt
// (client-map-facade.ts) reports any tile it isn't handed as "fogged", so a
// lookup that dropped the neighbour's tile read every tile in sight as
// remembered: the fogged mist's band past your vision never appeared, and
// fog-ring tiles beside land in sight were dimmed as if beside remembered
// land. The neighbour's tile must be passed through.
const loopSource = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "./client-runtime-loop.ts"), "utf8");

describe("2D neighbour visibility regression guard", () => {
  it("passes each neighbour's tile to tileVisibilityStateAt", () => {
    const line = loopSource.split("\n").find((l) => l.includes("const neighbourVisibility = (ox: number, oy: number): TileVisibilityState =>"));
    expect(line).toBeDefined();
    expect(line).toContain("deps.tileVisibilityStateAt(nx, ny, state.tiles.get(deps.keyFor(nx, ny)))");
  });
});
