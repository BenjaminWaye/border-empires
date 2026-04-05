import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("settled build gating regression guard", () => {
  it("routes placement through shared structure metadata", () => {
    const source = readFileSync(resolve(here, "./main.ts"), "utf8");

    expect(source).toContain('structureShowsOnTile(structureType');
    expect(source).toContain('const supportedDocks = supportedDockKeysForTile(tk, actor.id);');
    expect(source).not.toContain('placementMode === "dock_support" && docksByTile.has(tk)');
    expect(source).not.toContain('if (t.resource || townsByTile.has(tk)) return { ok: false, reason: `${structureType.toLowerCase()} requires empty owned land` };');
    expect(source).not.toContain('if (structureType === "RADAR_SYSTEM" || structureType === "GOVERNORS_OFFICE" || structureType === "FOUNDRY") {');
  });
});
