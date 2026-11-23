import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../client-photo-mode-style.css", import.meta.url), "utf8");

// Returns the declaration bodies of every rule whose selector ends in `.is-idle`, split by whether it sits inside @media (pointer: coarse).
const idleRules = (): { coarse: string[]; fine: string[] } => {
  const out = { coarse: [] as string[], fine: [] as string[] };
  const coarseStart = css.indexOf("@media (pointer: coarse)");
  expect(coarseStart).toBeGreaterThanOrEqual(0);
  const coarseEnd = css.indexOf("\n}\n", coarseStart);
  for (const match of css.matchAll(/#photo-mode-exit-control\.is-idle\s*\{([^}]*)\}/g)) {
    const at = match.index ?? 0;
    (at > coarseStart && at < coarseEnd ? out.coarse : out.fine).push(match[1] ?? "");
  }
  return out;
};

describe("photo mode exit control styling", () => {
  // Phones have no Esc or Ctrl+P and no hover: an invisible exit button is not findable, but an invisible live one exits by accident.
  it("ignores clicks while faded on a mouse", () => {
    const { fine } = idleRules();
    expect(fine.length).toBeGreaterThan(0);
    for (const body of fine) {
      expect(body).toMatch(/opacity:\s*0\s*;/);
      expect(body).toMatch(/pointer-events:\s*none/);
    }
  });

  it("stays faintly visible and tappable while faded on touch", () => {
    const { coarse } = idleRules();
    expect(coarse.length).toBeGreaterThan(0);
    for (const body of coarse) {
      const opacity = Number(/opacity:\s*([0-9.]+)/.exec(body)?.[1]);
      expect(opacity).toBeGreaterThan(0);
      expect(body).toMatch(/pointer-events:\s*auto/);
    }
  });
});
