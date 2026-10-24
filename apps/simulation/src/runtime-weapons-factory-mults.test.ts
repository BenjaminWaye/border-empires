import { describe, expect, it } from "vitest";
import {
  battleWarGearFor,
  noWarIndustryVulnerabilityLabelForAttacker,
  noWarIndustryVulnerabilityLabelForDefender,
  type WeaponsFactoryMultContext
} from "./runtime-weapons-factory-mults.js";

const contextWithCounts = (titanium: number, umbrite: number): WeaponsFactoryMultContext => ({
  ownedStructureCountForPlayer: (_playerId, structureType) => {
    if (structureType === "TITANIUM_WEAPONS_FACTORY") return titanium;
    if (structureType === "UMBRITE_WEAPONS_FACTORY") return umbrite;
    return 0;
  }
});

describe("noWarIndustryVulnerabilityLabelFor{Attacker,Defender}", () => {
  it("names the specific missing factory type for the defender-facing (attack-side) label", () => {
    expect(noWarIndustryVulnerabilityLabelForDefender(contextWithCounts(0, 1), "player-2")).toBe("Target missing Titanium Weapons Factory");
    expect(noWarIndustryVulnerabilityLabelForDefender(contextWithCounts(1, 0), "player-2")).toBe("Target missing Umbrite Weapons Factory");
    expect(noWarIndustryVulnerabilityLabelForDefender(contextWithCounts(0, 0), "player-2")).toBe("Target missing Titanium & Umbrite Weapons Factory");
  });

  it("names the specific missing factory type for the attacker-facing (defense-side) label", () => {
    expect(noWarIndustryVulnerabilityLabelForAttacker(contextWithCounts(0, 1), "player-1")).toBe("Attacker missing Titanium Weapons Factory");
    expect(noWarIndustryVulnerabilityLabelForAttacker(contextWithCounts(1, 0), "player-1")).toBe("Attacker missing Umbrite Weapons Factory");
    expect(noWarIndustryVulnerabilityLabelForAttacker(contextWithCounts(0, 0), "player-1")).toBe("Attacker missing Titanium & Umbrite Weapons Factory");
  });
});

describe("battleWarGearFor", () => {
  it("flags titanium armour once a side owns any Titanium Weapons Factory", () => {
    expect(battleWarGearFor(contextWithCounts(1, 0), "player-1")).toEqual({ titaniumArmor: true });
  });

  it("flags Umbrite arms once a side owns any Umbrite Weapons Factory, alongside titanium", () => {
    expect(battleWarGearFor(contextWithCounts(0, 4), "player-1")).toEqual({ umbriteArms: true });
    expect(battleWarGearFor(contextWithCounts(3, 2), "player-1")).toEqual({ titaniumArmor: true, umbriteArms: true });
  });

  it("leaves a side with no weapons factory (or no owner) in the standard kit", () => {
    expect(battleWarGearFor(contextWithCounts(0, 0), "player-1")).toBeUndefined();
    expect(battleWarGearFor(contextWithCounts(5, 0), undefined)).toBeUndefined();
  });
});
