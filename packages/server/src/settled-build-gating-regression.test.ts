import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("settled build gating regression guard", () => {
  it("requires settled owned land for light combat structures while still allowing mines on gems", () => {
    const source = readFileSync(resolve(here, "./main.ts"), "utf8");

    expect(source).toContain('if (t.ownershipState !== "SETTLED") return { ok: false, reason: "structure requires settled owned tile" };');
    expect(source).toContain('if (structureType === "MINE" && t.resource !== "IRON" && t.resource !== "GEMS") return { ok: false, reason: "mine requires IRON or CRYSTAL tile" };');
  });
});
