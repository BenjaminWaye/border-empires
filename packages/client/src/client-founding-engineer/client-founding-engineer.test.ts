import { describe, expect, it } from "vitest";

import { foundingEngineerNameHtml, isFoundingEngineerPlayerId, tileOwnerLabelHtml } from "./client-founding-engineer.js";

const FOUNDING_ENGINEER_PLAYER_ID = "VK5iriJAhickNf9ArrRweUDnq1W2";

describe("isFoundingEngineerPlayerId", () => {
  it("matches only the hardcoded founding engineer player id", () => {
    expect(isFoundingEngineerPlayerId(FOUNDING_ENGINEER_PLAYER_ID)).toBe(true);
    expect(isFoundingEngineerPlayerId("some-other-player")).toBe(false);
    expect(isFoundingEngineerPlayerId(undefined)).toBe(false);
  });

  // Regression: matching used to be by display name (case-insensitive), so a
  // renamed founding engineer would silently lose the badge, and anyone else
  // could gain it by renaming to the same string. Keying on the stable
  // player id instead means neither can happen.
  it("does not match on display name, even the founding engineer's own", () => {
    expect(isFoundingEngineerPlayerId("KonradsDelikatessKörv")).toBe(false);
    expect(isFoundingEngineerPlayerId("konradsdelikatesskörv")).toBe(false);
  });
});

describe("foundingEngineerNameHtml", () => {
  it("appends the badge only for the founding engineer's player id", () => {
    const html = foundingEngineerNameHtml("SomeName", FOUNDING_ENGINEER_PLAYER_ID);
    expect(html).toContain("founding-engineer-name");
    expect(html).toContain("SomeName");
  });

  it("returns the escaped name unchanged for any other player id", () => {
    const html = foundingEngineerNameHtml("SomeName", "some-other-player");
    expect(html).toBe("SomeName");
  });
});

describe("tileOwnerLabelHtml", () => {
  it("escapes the owner label and shows the badge for the founding engineer's tiles", () => {
    const html = tileOwnerLabelHtml("<script>alert(1)</script>", FOUNDING_ENGINEER_PLAYER_ID, false);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("founding-engineer-name");
  });

  it("omits the badge for a non-founding-engineer owner", () => {
    const html = tileOwnerLabelHtml("CopperWing", "some-other-player", false);
    expect(html).not.toContain("founding-engineer-name");
  });

  it("adds the is-ally class independently of the founding-engineer badge", () => {
    const html = tileOwnerLabelHtml("CopperWing", "some-other-player", true);
    expect(html).toContain("is-ally");
    expect(html).not.toContain("founding-engineer-name");
  });
});
