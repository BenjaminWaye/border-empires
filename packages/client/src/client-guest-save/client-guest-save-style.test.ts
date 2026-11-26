import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../client-guest-save-style.css", import.meta.url), "utf8");

const ruleBody = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};

describe("guest save badge styling", () => {
  it("is centred without a transform so .panel-btn:active cannot shift it left", () => {
    const body = ruleBody(".guest-save-badge");
    expect(body).not.toMatch(/transform\s*:/);
    expect(body).toMatch(/margin-inline:\s*auto/);
  });

  // The drone's planner, flight pill and report card share the badge's bottom-centre slot; the pill's
  // countdown covered "Guest · Save your empire" in flight (2026-11-26). The badge hides for those phases
  // only (scout-focus), never for the "Explore" offer pill a new player sees for days.
  it("hides while the scout drone is planned, flying or reporting", () => {
    expect(ruleBody("body.scout-focus .guest-save-badge")).toMatch(/display:\s*none/);
  });

  it("stays visible above the Explore offer pill instead of hiding", () => {
    expect(css).not.toMatch(/#scout-drone-(pill|dock)\[style\*="flex"\]\)\s*\.guest-save-badge/);
    const lifted = ruleBody('body:has(#scout-drone-pill.is-offer[style*="flex"]) .guest-save-badge');
    expect(lifted).toMatch(/bottom:\s*calc\(max\(18px, env\(safe-area-inset-bottom\)\) \+ 54px\)/);
    expect(lifted).not.toMatch(/display/);
  });
});
