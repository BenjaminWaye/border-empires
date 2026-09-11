import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard: the 2D-canvas per-tile support-ring highlight
// (client-runtime-loop.ts) calls deps.isTownSupportNeighbor without its
// optional 5th `anchorTier` argument, isTownSupportNeighbor
// (client-origin-selection.ts) silently defaults to the base radius-1 ring
// for every town tier -- so a GREAT_CITY/METROPOLIS town's 2nd ring (see
// supportRingRadiusForTier, packages/shared) renders correctly in the
// true-3D overlay (client-town-support-plot-lookup.ts, already tier-aware)
// but only shows its inner 8 tiles in the 2D-canvas fallback renderer,
// silently breaking AGENTS.md's renderer-parity rule. Both real (non-debug)
// call sites already have the selected tile's `.town.populationTier` in
// scope right above the call -- this just asserts it's actually threaded
// through instead of dropped.
const clientSource = (filename: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, filename), "utf8");
};

describe("2D support-ring highlight tier-radius regression guard", () => {
  it("passes the selected town's populationTier to isTownSupportNeighbor at both live-render call sites", () => {
    const source = clientSource("./client-runtime-loop.ts");
    const matches = source.match(/deps\.isTownSupportNeighbor\(wx, wy, state\.selected\.x, state\.selected\.y, selected\.town\.populationTier\)/g);
    expect(matches?.length ?? 0).toBe(2);
  });
});
