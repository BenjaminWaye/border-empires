import { describe, expect, it } from "vitest";

import { hostedSectorResultsHtml, parseHostedSectorResults } from "./client-hosted-sector-results.js";

describe("hosted sector results in My sectors", () => {
  it("shows the winner and your place, apart from rating", () => {
    const results = parseHostedSectorResults({ finished: true, houses: 24, rank: 2, winner: "<b>Varn</b>" });
    expect(hostedSectorResultsHtml(results)).toContain("Won by &#60;b&#62;Varn&#60;/b&#62; · You placed #2 of 24 · Not counted toward rating");
  });

  it("says when a sector closed before a crowning, and leaves out a place you did not have", () => {
    expect(hostedSectorResultsHtml(parseHostedSectorResults({ finished: false, houses: 12 }))).toContain("Closed before anyone was crowned · Not counted toward rating");
  });

  it("shows nothing without saved results, and ignores malformed ones", () => {
    expect(hostedSectorResultsHtml(undefined)).toBe("");
    expect(parseHostedSectorResults({ finished: "yes", houses: 2 })).toBeUndefined();
    expect(parseHostedSectorResults({ finished: true, houses: 0 })).toBeUndefined();
    expect(parseHostedSectorResults({ finished: true, houses: 3, rank: -1 })).toEqual({ finished: true, houses: 3 });
  });
});
