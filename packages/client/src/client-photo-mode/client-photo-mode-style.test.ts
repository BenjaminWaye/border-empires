import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../client-photo-mode-style.css", import.meta.url), "utf8");

const ruleBody = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
};

describe("photo mode exit control styling", () => {
  // Phones have no Esc or Ctrl+P: once the faded button ignored taps, they went to the map and photo mode could not be left.
  it("stays tappable while faded out", () => {
    const idle = ruleBody("#photo-mode-exit-control.is-idle");
    expect(idle).toMatch(/opacity:\s*0/);
    expect(idle).not.toMatch(/pointer-events\s*:\s*none/);
  });

  it("sits above the phone's home-indicator safe area", () => {
    expect(ruleBody("#photo-mode-exit-control")).toMatch(/bottom:\s*calc\([^;]*env\(safe-area-inset-bottom/);
  });
});
