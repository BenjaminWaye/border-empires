import { describe, expect, it } from "vitest";
import { techBlockedReasonSummary, techMissingResourceSummary, techMissingResourceSummaryHtml, techShouldHighlightMissingResources } from "./client-tech-requirements.js";
import type { TechInfo } from "./client-types.js";

const baseTech = (checklist: Array<{ label: string; met: boolean }>): Pick<TechInfo, "requirements"> => ({
  requirements: {
    gold: 0,
    resources: {},
    canResearch: false,
    checklist
  }
});

describe("tech requirement helpers", () => {
  it("surfaces missing resources when resources are the only blocker", () => {
    const tech = baseTech([
      { label: "Gold 2000", met: false },
      { label: "FOOD 40", met: false }
    ]);

    expect(techShouldHighlightMissingResources(tech)).toBe(true);
    expect(techMissingResourceSummary(tech)).toBe("✗ Gold 2000 · ✗ FOOD 40");
    expect(techMissingResourceSummaryHtml(tech)).toContain(">Gold 2000<");
    expect(techMissingResourceSummaryHtml(tech)).toContain(">FOOD 40<");
    expect(techBlockedReasonSummary(tech, "Requires Agriculture")).toEqual({
      label: "✗ Gold 2000 · ✗ FOOD 40",
      tone: "missing"
    });
  });

  it("suppresses red resource badges when a tech prerequisite is the real blocker", () => {
    const tech = baseTech([
      { label: "Gold 2000", met: false },
      { label: "FOOD 40", met: false },
      { label: "Requires Agriculture", met: false }
    ]);

    expect(techShouldHighlightMissingResources(tech)).toBe(false);
    expect(techMissingResourceSummary(tech)).toBeNull();
    expect(techMissingResourceSummaryHtml(tech)).toBeNull();
    expect(techBlockedReasonSummary(tech, "Requires Agriculture")).toEqual({
      label: "Requires Agriculture",
      tone: "blocked"
    });
  });

  it("falls back to non-resource blockers when nothing is missing from stock", () => {
    const tech = baseTech([{ label: "Requires Agriculture", met: false }]);

    expect(techMissingResourceSummary(tech)).toBeNull();
    expect(techBlockedReasonSummary(tech, "Requires Agriculture")).toEqual({
      label: "Requires Agriculture",
      tone: "blocked"
    });
  });
});
