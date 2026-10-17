import { describe, expect, it } from "vitest";
import { economyIntegrityCardHtml } from "./client-economy-integrity-card.js";

const tone = (value: number): string => (value < 0 ? "negative" : "positive");

describe("economyIntegrityCardHtml", () => {
  it("shows integrity in the Economy panel and opens the integrity breakdown", () => {
    const html = economyIntegrityCardHtml(93.6, tone);
    expect(html).toContain("Empire Integrity");
    expect(html).toContain("94%");
    expect(html).toContain('data-defensibility-open="true"');
  });

  it("clamps out-of-range values", () => {
    expect(economyIntegrityCardHtml(140, tone)).toContain("100%");
    expect(economyIntegrityCardHtml(-5, tone)).toContain("0%");
  });
});
