import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("generic build cancel regression guard", () => {
  it("routes all in-progress build cancel actions through the shared server helper", () => {
    const source = readFileSync(resolve(here, "./main.ts"), "utf8");

    expect(source).toContain("const cancelInProgressBuildForPlayer = (");
    expect(source).toContain('fort?.ownerId === actor.id && (fort.status === "under_construction" || fort.status === "removing")');
    expect(source).toContain('observatory?.ownerId === actor.id && (observatory?.status === "under_construction" || observatory?.status === "removing")');
    expect(source).toContain('siege?.ownerId === actor.id && (siege.status === "under_construction" || siege.status === "removing")');
    expect(source).toContain('structure?.ownerId === actor.id && (structure.status === "under_construction" || structure.status === "removing")');
    expect(source).toContain("const out = cancelInProgressBuildForPlayer(actor, tk);");
  });
});
