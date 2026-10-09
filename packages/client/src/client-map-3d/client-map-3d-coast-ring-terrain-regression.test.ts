import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// The fog's first ring (unexplored tiles touching explored land) is reported
// as "fogged" so its ground draws under the unexplored storm's see-through
// coast band (withUnexploredCoastRingAsFogged). The fogged branch of the
// per-tile loop `continue`s before mountains and forests, so without an
// explicit carve-out the ring showed bare, flat ground. Guarded at source
// level because the per-tile loop needs a live WebGL context to run.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "client-map-3d.ts"), "utf8");

describe("first fog ring loads its natural terrain in 3D", () => {
  it("routes visibility through the coast-ring wrapper for both the terrain and the per-tile loop", () => {
    expect(source).toMatch(/const visibilityAt = withUnexploredCoastRingAsFogged\(/);
    expect(source).toMatch(/const visibility = visibilityAt\(wx, wy\);/);
  });

  it("skips the fog darken for ring tiles (it read as a dark hole beside explored land)", () => {
    const fogBranchStart = source.indexOf('if (visibility === "fogged" && !revealWholeMapInTrue3DMode) {');
    const ringFlag = source.indexOf('const isFogRing = deps.tileVisibilityStateAt(wx, wy, tile) === "unexplored";', fogBranchStart);
    expect(ringFlag).toBeGreaterThan(fogBranchStart);
    expect(source).toContain("if (fogIsHill && !isFogRing) {\n            fogDarkenOverlay.addHillTile(");
    expect(source).toContain("} else if (!isFogRing) {\n            fogDarkenOverlay.addTile(");
  });

  it("adds mountains, forests and grass scatter for ring tiles inside the fogged branch", () => {
    const fogBranchStart = source.indexOf('if (visibility === "fogged" && !revealWholeMapInTrue3DMode) {');
    const carveOut = source.indexOf("if (isFogRing) {", fogBranchStart);
    expect(fogBranchStart).toBeGreaterThan(-1);
    expect(carveOut).toBeGreaterThan(fogBranchStart);
    const block = source.slice(carveOut, source.indexOf("continue;", carveOut));
    expect(block).toContain("mountainMassifs.addInstance(");
    expect(block).toContain("shouldDrawForestInstance(forestTile, tile)");
    expect(block).toContain("shouldDrawLightGrassScatterInstance(lightGrassScatterTile, tile)");
  });
});
