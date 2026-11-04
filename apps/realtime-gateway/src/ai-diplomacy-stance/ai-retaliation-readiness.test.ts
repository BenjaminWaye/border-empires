import { describe, expect, it } from "vitest";

import { aiRetaliationReadiness } from "./ai-retaliation-readiness.js";

const MIN = 60_000;

describe("aiRetaliationReadiness", () => {
  it("counts free and mustered manpower against cap", () => {
    expect(aiRetaliationReadiness({ manpower: 300, musterManpower: 300, manpowerCap: 1000 }, 20 * MIN)).toEqual({ readiness: 0.6, ready: true, boxedIn: false });
    expect(aiRetaliationReadiness({ manpower: 100, musterManpower: 100, manpowerCap: 1000 }, 20 * MIN).ready).toBe(false);
  });

  it("counts a refill only when it lands before the window closes", () => {
    const ai = { manpower: 100, musterManpower: 0, manpowerCap: 1000, nextRefillInMs: 10 * MIN, nextRefillManpower: 500 };
    expect(aiRetaliationReadiness(ai, 20 * MIN).ready).toBe(true);
    expect(aiRetaliationReadiness(ai, 5 * MIN).ready).toBe(false);
  });

  it("is boxed in only when the snapshot says there is nowhere else to grow", () => {
    const ai = { manpower: 800, musterManpower: 0, manpowerCap: 1000 };
    expect(aiRetaliationReadiness({ ...ai, hasOtherExpansion: false }, MIN).boxedIn).toBe(true);
    expect(aiRetaliationReadiness(ai, MIN).boxedIn).toBe(false);
  });
});
