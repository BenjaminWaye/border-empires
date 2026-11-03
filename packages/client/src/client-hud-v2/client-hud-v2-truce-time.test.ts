import { describe, expect, it } from "vitest";
import { truceTimeLeft } from "./client-hud-v2-truce-time.js";

const HOUR = 3_600_000;
const MIN = 60_000;

describe("truce time left", () => {
  it("shows whole hours, rounded up, while an hour or more remains", () => {
    expect(truceTimeLeft(24 * HOUR, 0)).toBe("24h");
    expect(truceTimeLeft(HOUR + MIN, 0)).toBe("2h");
    expect(truceTimeLeft(HOUR, 0)).toBe("1h");
  });

  // Regression: a truce in its last hour read a flat "1h" with no minutes.
  it("counts down in minutes in the last hour", () => {
    expect(truceTimeLeft(42 * MIN, 0)).toBe("42m");
    expect(truceTimeLeft(41 * MIN + 1, 0)).toBe("42m");
    expect(truceTimeLeft(HOUR - 1, 0)).toBe("60m");
  });

  it("never reads zero while the truce is still listed", () => {
    expect(truceTimeLeft(30_000, 0)).toBe("1m");
    expect(truceTimeLeft(0, 5 * MIN)).toBe("1m");
  });
});
