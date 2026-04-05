import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("settled build gating regression guard", () => {
  it("uses shared structure metadata in tile menu and hold-build UI", () => {
    const source =
      readFileSync(resolve(here, "./client-ui-controls.ts"), "utf8") +
      readFileSync(resolve(here, "./client-tile-action-logic.ts"), "utf8") +
      readFileSync(resolve(here, "./client-tile-action-support.ts"), "utf8") +
      readFileSync(resolve(here, "./client-tile-menu-view.ts"), "utf8");

    expect(source).toContain('structureShowsOnTile("WOODEN_FORT"');
    expect(source).toContain('structureShowsOnTile("OBSERVATORY"');
    expect(source).toContain('const townBuildSource =');
    expect(source).toContain('build_customs_house');
    expect(source).toContain('buildings: buildingRows.length ? buildingRows : []');
    expect(source).toContain('supportPlacementBlocked');
    expect(source).toContain('const canShowBuildingsTab =');
  });
});
