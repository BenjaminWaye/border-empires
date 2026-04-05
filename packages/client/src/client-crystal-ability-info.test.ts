import { describe, expect, it } from "vitest";
import type { TechInfo } from "./client-types.js";
import { relatedCrystalAbilitiesForTech, renderCrystalAbilityInfoOverlay } from "./client-crystal-ability-info.js";

describe("crystal ability tech previews", () => {
  it("maps tech effects to crystal ability previews", () => {
    const tech: Pick<TechInfo, "effects"> = {
      effects: {
        unlockRevealEmpire: true,
        unlockSabotage: true,
        unlockTerrainShaping: true
      }
    };

    expect(relatedCrystalAbilitiesForTech(tech)).toEqual(["reveal_empire", "siphon", "create_mountain", "remove_mountain"]);
  });

  it("renders a detailed preview overlay for Aether Bridge", () => {
    const html = renderCrystalAbilityInfoOverlay("aether_bridge", {
      formatCooldownShort: (ms) => `${Math.round(ms / 60_000)}m`
    });

    expect(html).toContain("Crystal Ability");
    expect(html).toContain("Aether Bridge");
    expect(html).toContain("30 CRYSTAL");
    expect(html).toContain("8m");
    expect(html).toContain("Target coastal land");
  });
});
