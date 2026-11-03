import { describe, expect, it } from "vitest";
import { renderDomainProgressCardHtml } from "../client-domain-progress-card.js";

describe("renderDomainProgressCardHtml", () => {
  it("names the open doctrine tier", () => {
    const html = renderDomainProgressCardHtml({ currentTier: 2, chosenDomainCount: 1 });
    expect(html).toContain("Tier 2 is open for your next doctrine pick.");
    expect(html).toContain("Tier 2 live");
  });

  it("counts chosen doctrines once every open tier is committed", () => {
    const html = renderDomainProgressCardHtml({ currentTier: undefined, chosenDomainCount: 3 });
    expect(html).toContain("All open domain tiers are currently committed.");
    expect(html).toContain("3 chosen");
  });

  it("no longer mentions Shards", () => {
    expect(renderDomainProgressCardHtml({ currentTier: 1, chosenDomainCount: 0 })).not.toMatch(/shard/i);
  });
});
