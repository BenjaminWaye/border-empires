import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientHudSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./client-hud.ts"), "utf8");
};

describe("defensibility mobile regression guard", () => {
  it("returns to the map after enabling weak-tile overlay on mobile", () => {
    const source = clientHudSource();
    expect(source).toContain('if (isMobile() && state.mobilePanel === "defensibility") {');
    expect(source).toContain('state.mobilePanel = "core";');
    expect(source).toContain("state.activePanel = null;");
  });
});
