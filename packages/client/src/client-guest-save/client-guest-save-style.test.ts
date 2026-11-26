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

  // The drone dock, flight pill and report card share the badge's bottom-centre slot; the pill's
  // countdown covered "Guest · Save your empire" in flight (2026-11-26). The badge steps aside.
  it.each(["#scout-drone-dock", "#scout-drone-pill", "#scout-report-card"])("hides while %s is shown", (id) => {
    const body = ruleBody(`body:has(${id}[style*="flex"]) .guest-save-badge`);
    expect(body).toMatch(/display:\s*none/);
  });
});
