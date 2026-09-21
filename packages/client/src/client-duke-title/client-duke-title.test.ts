import { describe, expect, it } from "vitest";

import { dukeNameHtml, dukeTagHtml, isDukeFromHoldings } from "./client-duke-title.js";

describe("dukeNameHtml", () => {
  it("wraps the name and appends the crown tag when isDuke is true", () => {
    const html = dukeNameHtml("SomeName", true);
    expect(html).toContain("duke-name");
    expect(html).toContain("SomeName");
    expect(html).toContain("duke-tag");
  });

  it("returns the name unchanged when isDuke is false", () => {
    const html = dukeNameHtml("SomeName", false);
    expect(html).toBe("SomeName");
  });
});

describe("dukeTagHtml", () => {
  it("renders an accessible crown icon", () => {
    const html = dukeTagHtml();
    expect(html).toContain("Duke");
    expect(html).toContain("<svg");
  });
});

describe("isDukeFromHoldings", () => {
  it("is true when the holdings view has at least one planet", () => {
    expect(isDukeFromHoldings({ planets: [{}] })).toBe(true);
  });

  it("is false when the holdings view has no planets", () => {
    expect(isDukeFromHoldings({ planets: [] })).toBe(false);
  });

  it("is false when holdings is undefined", () => {
    expect(isDukeFromHoldings(undefined)).toBe(false);
  });
});
