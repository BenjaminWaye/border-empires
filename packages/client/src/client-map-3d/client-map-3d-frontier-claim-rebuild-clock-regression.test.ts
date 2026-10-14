import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Regression: maybeRebuild passed its render-loop nowMs (performance.now(),
// page-relative) straight into activeFrontierAttackClaimTargetKeys, which
// compares against server epoch resolvesAt/transitEndsAt. Every claim looked
// perpetually unresolved, so a finished claim's key never left the snapshot
// and the "claim end" rebuild never fired from this trigger (muster claims
// never entered it either, since transitEndsAt always looked in the future).
// The snapshot now comes from frontierAttackClaimRebuildSnapshot (called by
// captureMap3DRebuildTriggers, which takes no clock argument), which reads the
// epoch clock itself (behaviour covered in
// client-map-3d-rebuild-triggers-claim-clock.test.ts). This file is too heavy to construct
// in a unit test, so verify the wiring by reading the source, like
// client-map-3d-first-render-breadcrumb-regression.test.ts does.
describe("client-map-3d frontier-claim rebuild trigger clock", () => {
  const source = readFileSync(new URL("./client-map-3d.ts", import.meta.url), "utf8");

  const maybeRebuildBlock = (): string => {
    const start = source.indexOf("const maybeRebuild = (nowMs: number)");
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("rebuildVisibleTerrain(builtWindow)", start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  };

  it("captures rebuild triggers without passing the render loop's clock", () => {
    expect(maybeRebuildBlock()).toContain("captureMap3DRebuildTriggers(deps.state, deps.keyFor, isTrue3DRendererActive())");
    expect(maybeRebuildBlock()).not.toMatch(/captureMap3DRebuildTriggers\([^)]*\bnowMs\b/);
  });

  it("never feeds the page-relative nowMs into activeFrontierAttackClaimTargetKeys", () => {
    expect(maybeRebuildBlock()).not.toMatch(/activeFrontierAttackClaimTargetKeys\([^)]*\bnowMs\b/);
  });

  it("still throttles rebuilds on the render loop's nowMs", () => {
    expect(maybeRebuildBlock()).toContain("nowMs - lastRebuild.at >= REBUILD_MIN_INTERVAL_MS");
  });
});
