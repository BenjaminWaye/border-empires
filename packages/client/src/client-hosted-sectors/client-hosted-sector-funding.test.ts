import { describe, expect, it } from "vitest";

import { fundingLeftCents, readChipInCents, timeLeft, usd } from "./client-hosted-sector-funding.js";

describe("split funding helpers", () => {
  it("formats dollars, time left and what is still to pledge", () => {
    expect(usd(2000)).toBe("USD 20");
    expect(usd(750)).toBe("USD 7.50");
    expect(timeLeft(0 + 50 * 3_600_000, 0)).toBe("2 days");
    expect(timeLeft(5 * 3_600_000, 0)).toBe("5 hours");
    expect(timeLeft(1_000, 0)).toBe("under an hour");
    expect(fundingLeftCents({ targetCents: 2000, pledgedCents: 1200, pendingCents: 500, deadline: 0, minimumCents: 500, yourCents: 0 })).toBe(300);
  });

  it("reads a typed amount as whole cents, with a comma or a point", () => {
    expect(readChipInCents("7.50")).toBe(750);
    expect(readChipInCents("7,5")).toBe(750);
    expect(readChipInCents("5")).toBe(500);
    expect(readChipInCents("")).toBeUndefined();
    expect(readChipInCents("-3")).toBeUndefined();
    expect(readChipInCents("abc")).toBeUndefined();
  });
});
