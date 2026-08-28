import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Regression coverage for the crash-breadcrumb wiring around the first
// terrain rebuild (see client-renderer-crash-breadcrumb.ts): this file is
// too large/heavy to unit-test rebuildVisibleTerrain() directly (it needs a
// full WebGL renderer, scene, and world state), so verify the wiring by
// reading the source the way client-hud-renderer-prompt-download-regression
// .test.ts does for the diagnostics download button.
describe("client-map-3d first-render crash breadcrumb wiring", () => {
  const source = readFileSync(new URL("./client-map-3d.ts", import.meta.url), "utf8");

  it("imports the first-render breadcrumb markers", () => {
    expect(source).toContain("markRendererFirstRenderStarted");
    expect(source).toContain("markRendererFirstRenderCompleted");
  });

  it("marks the risky window around rebuildVisibleTerrain only for the first rebuild", () => {
    const maybeRebuildAt = source.indexOf("const maybeRebuild = (nowMs: number)");
    expect(maybeRebuildAt).toBeGreaterThan(-1);

    const block = source.slice(maybeRebuildAt, maybeRebuildAt + 1800);
    expect(block).toContain("isFirstRebuild = lastRebuild.at === 0");

    const startedAt = block.indexOf("markRendererFirstRenderStarted()");
    const rebuildAt = block.indexOf("rebuildVisibleTerrain(builtWindow)");
    const completedAt = block.indexOf("markRendererFirstRenderCompleted()");

    // Started must be written before the heavy call, completed only after it
    // returns — that ordering is the entire point: a crash inside the call
    // must leave "started" on disk with no matching "completed".
    expect(startedAt).toBeGreaterThan(-1);
    expect(rebuildAt).toBeGreaterThan(startedAt);
    expect(completedAt).toBeGreaterThan(rebuildAt);
  });
});
