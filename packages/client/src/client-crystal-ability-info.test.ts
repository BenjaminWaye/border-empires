import { describe, expect, it } from "vitest";
import type { TechInfo } from "./client-types.js";
import { relatedCrystalAbilitiesForTech, renderCrystalAbilityInfoOverlay } from "./client-crystal-ability-info.js";

describe("crystal ability tech previews", () => {
  it("maps tech effects to crystal ability previews", () => {
    const tech: Pick<TechInfo, "effects"> = {
      effects: {
        unlockRevealEmpire: true,
        unlockRevealEmpireStats: true,
        unlockAetherWall: true,
        unlockSabotage: true,
        unlockTerrainShaping: true
      }
    };

    expect(relatedCrystalAbilitiesForTech(tech)).toEqual([
      "reveal_empire",
      "reveal_empire_stats",
      "aether_wall",
      "siphon",
      "create_mountain",
      "remove_mountain"
    ]);
  });

  it("renders a detailed preview overlay for Aether Bridge", () => {
    const html = renderCrystalAbilityInfoOverlay("aether_bridge", {
      formatCooldownShort: (ms) => `${Math.round(ms / 60_000)}m`
    });

    expect(html).toContain("Ability");
    expect(html).toContain("Aether Bridge");
    expect(html).toContain("30 CRYSTAL");
    expect(html).toContain("8m");
    expect(html).toContain("Target coastal land");
  });

  it("maps Signal Fires to the Aether Lance preview", () => {
    const tech: Pick<TechInfo, "effects"> = {
      effects: {
        unlockAetherLance: true
      }
    };

    expect(relatedCrystalAbilitiesForTech(tech)).toEqual(["aether_lance"]);
  });

  it("maps Surveying to Survey Sweep and Beacon Towers to Reveal Empire", () => {
    const surveying: Pick<TechInfo, "effects"> = {
      effects: {
        unlockSurveySweep: true
      }
    };
    const beaconTowers: Pick<TechInfo, "effects"> = {
      effects: {
        unlockRevealEmpire: true
      }
    };

    expect(relatedCrystalAbilitiesForTech(surveying)).toEqual(["survey_sweep"]);
    expect(relatedCrystalAbilitiesForTech(beaconTowers)).toEqual(["reveal_empire"]);
  });

  it("maps late combat and monument techs to their ability previews", () => {
    const tech: Pick<TechInfo, "effects"> = {
      effects: {
        unlockSabotage: true,
        unlockStormfront: true,
        unlockAegisLock: true
      }
    };

    expect(relatedCrystalAbilitiesForTech(tech)).toEqual(["siphon", "stormfront", "aegis_lock"]);
  });

  it("maps Grand Synthesis to the Retort Transmutation preview", () => {
    const tech: Pick<TechInfo, "effects"> = {
      effects: {
        unlockRetortRecasting: true
      }
    };

    expect(relatedCrystalAbilitiesForTech(tech)).toEqual(["retort_recasting"]);
  });
});
