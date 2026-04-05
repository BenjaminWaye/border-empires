import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("structure removal regression guard", () => {
  it("uses structure-specific build durations and the generic remove action", () => {
    const source = readFileSync(resolve(here, "./main.ts"), "utf8");

    expect(source).toContain("const tryRemoveStructure = (actor: Player, x: number, y: number): { ok: boolean; reason?: string } => {");
    expect(source).toContain('const removeDurationMs = structureBuildDurationMsForRuntime("FORT");');
    expect(source).toContain('const removeDurationMs = structureBuildDurationMsForRuntime("OBSERVATORY");');
    expect(source).toContain('const removeDurationMs = structureBuildDurationMsForRuntime("SIEGE_OUTPOST");');
    expect(source).toContain("const removeDurationMs = structureBuildDurationMsForRuntime(structure.type);");
    expect(source).toContain("structure.completesAt = now() + removeDurationMs;");
    expect(source).toContain('if (msg.type === "REMOVE_STRUCTURE") {');
  });
});
