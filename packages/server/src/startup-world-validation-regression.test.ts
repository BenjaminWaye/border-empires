import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readLocal = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

describe("startup world validation regression guard", () => {
  it("treats loaded snapshots as authoritative instead of regenerating strategic world state", () => {
    const source = readLocal("./main.ts");
    expect(source).toContain("const loadedSnapshot = loadSnapshot();");
    expect(source).toContain("!loadedSnapshot && (");
    expect(source).toContain("if (!loadedSnapshot && (dockById.size === 0 || docksByTile.size === 0 || !hasCrossContinentDockPairs || townsByTile.size === 0)) {");
  });

  it("returns whether a snapshot was successfully loaded", () => {
    const source = readLocal("./server-snapshot-hydrate.ts");
    expect(source).toContain("const loadSnapshot = (): boolean => {");
    expect(source).toContain("if (!raw) return false;");
    expect(source).toContain("hydrateSnapshotState(raw);");
    expect(source).toContain("return true;");
  });
});
