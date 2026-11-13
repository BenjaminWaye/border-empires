import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MANIFEST_LEGEND_HTML, manifestPipHtml } from "./client-hud-v2-manifest.js";

// Playtest 2026-11-12 (pt-oldphone, deuteranopia): the Manifest legend put green "Commissioned" next to
// dark-brown "Locked", told apart by colour alone. Each state now has its own shape.
const css = readFileSync(new URL("./client-hud-v2-screens.css", import.meta.url), "utf8");
const rule = (selector: string): string => css.match(new RegExp(`\\${selector} \\{([^}]*)\\}`))?.[1] ?? "";

describe("Manifest state pips", () => {
  it("marks commissioned with a tick and leaves the others glyph-free", () => {
    expect(manifestPipHtml("owned")).toContain("✓");
    expect(manifestPipHtml("available")).not.toContain("✓");
    expect(manifestPipHtml("locked")).not.toContain("✓");
  });

  it("uses the shaped pips in the legend", () => {
    expect(MANIFEST_LEGEND_HTML).toContain(`${manifestPipHtml("owned")}Commissioned`);
    expect(MANIFEST_LEGEND_HTML).toContain(`${manifestPipHtml("locked")}Locked`);
  });

  it("draws available hollow and locked hatched", () => {
    expect(rule(".v2m-pip-available")).toMatch(/background: transparent/);
    expect(rule(".v2m-pip-available")).toMatch(/border-radius: 50%/);
    expect(rule(".v2m-pip-locked")).toMatch(/repeating-linear-gradient/);
  });
});
