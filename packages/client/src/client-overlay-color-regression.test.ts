import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const renderSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./client-map-render.ts"), "utf8");
};

describe("ownership overlay color regression guard", () => {
  it("uses the player color directly without tint blending", () => {
    const source = renderSource();
    expect(source).toContain("): string => deps.ownerColor(ownerId);");
    expect(source).not.toContain("blendHex(");
    expect(source).not.toContain("tintTargetForStyle(");
  });
});
