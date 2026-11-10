// happy-dom does not resolve the cascade, so guard the layout rules in the stylesheet.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./client-hud-v2-compact.css", import.meta.url), "utf8");
const screensCss = readFileSync(new URL("./client-hud-v2-compact-screens.css", import.meta.url), "utf8");

const declarationsFor = (selector: string): string[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors?.trim() === selector)
    .map(([,, declarations]) => declarations!.trim());

describe("compact HUD styles", () => {
  it("keeps the opaque navigation row within its reserved height", () => {
    const rules = declarationsFor("body.hud-v2-compact .hud-v2-nav").join("\n");
    expect(rules).toContain("background: var(--v2-ink-solid)");
    expect(rules).toContain("box-sizing: border-box");
    expect(rules).toContain("height: var(--v2c-bottom)");
  });

  it("lets the Profile sections grow inside one scroll area", () => {
    expect(screensCss).toMatch(/body\.hud-v2-compact \.v2p\s*\{[^}]*grid-auto-rows:\s*max-content;[^}]*overflow-y:\s*auto;/);
    expect(screensCss).toMatch(/body\.hud-v2-compact \.v2p-hero\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/);
    expect(screensCss).toMatch(/body\.hud-v2-compact \.v2p-main\s*\{[^}]*overflow:\s*visible;/);
  });

  it("keeps all resource chips and Settings in a single row", () => {
    const rules = declarationsFor("body.hud-v2-compact .hud-v2-bar").join("\n");
    expect(rules).toContain("flex-wrap: nowrap");
    expect(rules).not.toMatch(/overflow(?:-x|-y)?:/);
    expect(css).not.toMatch(/--v2c-bar-rows/);

    const chip = declarationsFor("body.hud-v2-compact .hud-v2-bar .hud-v2-chip").join("\n");
    expect(chip).toContain("min-width: 0");
    const gear = declarationsFor("body.hud-v2-compact .hud-v2-bar .hud-v2-gear").join("\n");
    expect(gear).toContain("flex: 0 0 var(--v2c-touch)");
    expect(declarationsFor("body.hud-v2-compact .hud-v2-gear")).toEqual([]);
  });

  it("anchors the tracker and screens below the one-row ribbon", () => {
    const layout = declarationsFor("body.hud-v2-compact").join("\n");
    expect(layout).toContain("--v2c-bar-h: calc(var(--v2c-touch) + 2px)");
    expect(layout).toMatch(/--v2c-top:.*var\(--v2c-bar-h\)/);
  });
});
