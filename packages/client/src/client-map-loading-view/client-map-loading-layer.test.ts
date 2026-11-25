import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECONNECT_BANNER_BODY_CLASS, syncReconnectBannerLayer } from "./client-map-loading-layer.js";

const css = readFileSync(new URL("../client-deploy-countdown/client-deploy-countdown.css", import.meta.url), "utf8");
const hudCss = [
  "../client-hud-v2/client-hud-v2-compact.css",
  "../client-hud-v2/client-hud-v2-screens.css",
  "../style.css"
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

const ruleBody = (selector: string): string => {
  const start = css.indexOf(`${selector}`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf("{", start), css.indexOf("}", start));
};

// Playtest 2026-11-25 18:40: during a deploy restart the in-game "Server update
// in progress" banner sat under the tutorial guide card. #hud is position:
// fixed (its own stacking context), so the body-level guide (z-index 23/48)
// always painted over the banner inside it.
describe("in-game reconnect banner layering", () => {
  it("toggles the body class only while the in-game banner is up", () => {
    const classes = new Set<string>();
    const body = { classList: { toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name), on) } } as unknown as HTMLElement;
    syncReconnectBannerLayer(body, true);
    expect(classes.has(RECONNECT_BANNER_BODY_CLASS)).toBe(true);
    syncReconnectBannerLayer(body, false);
    expect(classes.has(RECONNECT_BANNER_BODY_CLASS)).toBe(false);
  });

  it("raises the banner over every HUD card inside #hud", () => {
    const bannerZ = Number(/z-index:\s*(\d+)/.exec(ruleBody(`body.${RECONNECT_BANNER_BODY_CLASS} #map-loading-overlay`))?.[1]);
    const hudZs = [...hudCss.matchAll(/z-index:\s*(\d+)/g)].map((match) => Number(match[1])).filter((z) => z < 1_000);
    expect(bannerZ).toBeGreaterThan(Math.max(...hudZs));
  });

  it("moves the body-level guide card, checklist and tips out of the way", () => {
    const body = ruleBody(`body.${RECONNECT_BANNER_BODY_CLASS} #tutorial-guide-root`);
    expect(body).toContain("display: none !important");
    for (const selector of ["#tutorial-guide-root", ".onb-root", "#discovery-tip-overlay"]) {
      expect(css).toContain(`body.${RECONNECT_BANNER_BODY_CLASS} ${selector}`);
    }
  });
});
