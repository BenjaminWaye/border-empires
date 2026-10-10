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

  it("keeps natural terrain (mountains, forests, grass scatter) on every fogged tile, ring included", () => {
    const fogBranchStart = source.indexOf('if (visibility === "fogged" && !revealWholeMapInTrue3DMode) {');
    const features = source.indexOf("// Natural terrain is not live data, so it stays", fogBranchStart);
    expect(features).toBeGreaterThan(fogBranchStart);
    const block = source.slice(features, source.indexOf("continue;", features));
    expect(block).toContain("mountainMassifs.addInstance(");
    expect(block).toContain("shouldDrawForestInstance(forestTile, tile)");
    expect(block).toContain("shouldDrawLightGrassScatterInstance(lightGrassScatterTile, tile)");
    expect(block).not.toContain("if (isFogRing)"); // every fogged tile, not just the ring
  });

  it("prints remembered land, features and (non-ring) sea in sepia", () => {
    expect(source).toContain("const fogPrintSepia = new Color(FOGGED_PRINT_SEPIA), fogFeatureTint = new Color(FOGGED_PRINT_FEATURE_TINT);");
    // A normal-blend wash, not a multiply: a multiply can only darken, which left remembered grass dark olive.
    expect(source).toContain('{ settled: FOGGED_PRINT_WASH_OPACITY, frontier: FOGGED_PRINT_WASH_OPACITY }, undefined, { settled: "normal", frontier: "normal" }');
    expect(source).toContain("const featureTint = isFogRing ? undefined : fogFeatureTint;");
    expect(source).toContain("mountainMassifs.addInstance(x, z, surfaceY, featureTint)");
    expect(source).not.toContain("tmpBlack");
    expect(source).toContain("deps.wrapX, deps.wrapY), wx, wy, !isFogRing);");
  });
});
