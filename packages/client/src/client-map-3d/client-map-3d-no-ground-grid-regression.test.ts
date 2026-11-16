import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// The live true-3D map draws no ground grid. The heightfield still offers
// optional gridlines (Storybook uses them as a layout aid), so guard the
// wiring by reading the source, like the other client-map-3d regressions.
describe("client-map-3d ground grid", () => {
  const source = readFileSync(new URL("./client-map-3d.ts", import.meta.url), "utf8");

  it("does not add or enable the heightfield gridlines", () => {
    expect(source).not.toContain("heightfield.gridlines");
    expect(source).not.toContain("setGridlinesVisible(true)");
  });
});
