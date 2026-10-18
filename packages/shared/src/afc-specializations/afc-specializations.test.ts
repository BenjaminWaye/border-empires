import { describe, expect, it } from "vitest";
import { AFC_SPECIALIZATIONS, afcSpecializationProgress, usesAfcSpecializations } from "./afc-specializations.js";

describe("AFC specialization catalogue and free-tier progression", () => {
  it("defines six real paths with exactly one upgrade at each of five tiers", () => {
    expect(AFC_SPECIALIZATIONS).toHaveLength(30);
    const branches = new Set(AFC_SPECIALIZATIONS.map(upgrade => upgrade.branch));
    expect(branches.size).toBe(6);
    expect(new Set(AFC_SPECIALIZATIONS.map(upgrade => upgrade.id)).size).toBe(30);
    for (const branch of branches) {
      expect(AFC_SPECIALIZATIONS.filter(upgrade => upgrade.branch === branch).map(upgrade => upgrade.tier)).toEqual([1, 2, 3, 4, 5]);
    }
    for (const upgrade of AFC_SPECIALIZATIONS) {
      expect(upgrade.description.length).toBeGreaterThan(40);
      expect(upgrade.mechanicalSummary.length).toBeGreaterThan(20);
      expect(Object.keys(upgrade.effects).length).toBeGreaterThan(0);
    }
  });
  it("requires a commissioned Manifest and banks all earlier choices", () => {
    const techs = [{ id: "tier-five", tier: 5 }, { id: "tier-one", tier: 1 }];
    expect(afcSpecializationProgress({ techIds: [] }, techs).choices).toEqual([]);
    const ids: string[] = [];
    for (let tier = 1; tier <= 5; tier += 1) {
      const result = afcSpecializationProgress({ techIds: ["tier-five"], domainIds: ids }, techs);
      expect(result.nextTier).toBe(tier);
      expect(result.choices).toHaveLength(6);
      expect(result.choices.every(id => id.endsWith(`-${tier}`))).toBe(true);
      ids.push(result.choices[0]!);
    }
    expect(afcSpecializationProgress({ techIds: ["tier-five"], domainIds: ids }, techs).nextTier).toBeUndefined();
  });
  it("preserves old-season policy and recognizes persisted new IDs", () => {
    expect(usesAfcSpecializations({ domainIds: ["mercantile-charter"] })).toBe(false);
    expect(usesAfcSpecializations({ afcUpgradeRuleset: "afc-v1" })).toBe(true);
    expect(usesAfcSpecializations({ domainIds: ["afc-chancery-1"] })).toBe(true);
  });
});
