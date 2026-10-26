import { describe, expect, it } from "vitest";
import {
  battleWarGearFor,
  noWarIndustryEdgeForAttacker,
  noWarIndustryEdgeForDefender,
  type WeaponsFactoryMultContext
} from "./runtime-weapons-factory-mults.js";

const contextWithCounts = (titanium: number, umbrite: number): WeaponsFactoryMultContext => ({
  ownedStructureCountForPlayer: (_playerId, structureType) => {
    if (structureType === "TITANIUM_WEAPONS_FACTORY") return titanium;
    if (structureType === "UMBRITE_WEAPONS_FACTORY") return umbrite;
    return 0;
  }
});

// Per-player counts: player-1 attacks, player-2 defends.
const contextWithPlayerCounts = (counts: Record<string, { titanium: number; umbrite: number }>): WeaponsFactoryMultContext => ({
  ownedStructureCountForPlayer: (playerId, structureType) => {
    const c = counts[playerId] ?? { titanium: 0, umbrite: 0 };
    if (structureType === "TITANIUM_WEAPONS_FACTORY") return c.titanium;
    if (structureType === "UMBRITE_WEAPONS_FACTORY") return c.umbrite;
    return 0;
  }
});

describe("noWarIndustryEdgeFor{Attacker,Defender}", () => {
  it("names only the factory types the bonus holder owns and the other side lacks", () => {
    // Attacker with no factories vs a Titanium-only defender: no attack
    // bonus (the attacker owns no Umbrite either); defense label names
    // Titanium alone, not "Titanium & Umbrite".
    const ctx = contextWithPlayerCounts({ "player-1": { titanium: 0, umbrite: 0 }, "player-2": { titanium: 1, umbrite: 0 } });
    expect(noWarIndustryEdgeForAttacker(ctx, "player-1", "player-2")).toEqual({ mult: 1, label: undefined });
    expect(noWarIndustryEdgeForDefender(ctx, "player-1", "player-2")).toEqual({ mult: 2, label: "Attacker missing Titanium Weapons Factory" });
  });

  it("names both types when the holder owns both and the other side has none", () => {
    const ctx = contextWithPlayerCounts({ "player-1": { titanium: 2, umbrite: 1 }, "player-2": { titanium: 0, umbrite: 0 } });
    expect(noWarIndustryEdgeForAttacker(ctx, "player-1", "player-2")).toEqual({ mult: 2, label: "Target missing Titanium & Umbrite Weapons Factory" });
    expect(noWarIndustryEdgeForDefender(ctx, "player-1", "player-2")).toEqual({ mult: 1, label: undefined });
  });

  it("gives no edge without a defender owner", () => {
    const ctx = contextWithPlayerCounts({ "player-1": { titanium: 1, umbrite: 1 } });
    expect(noWarIndustryEdgeForAttacker(ctx, "player-1", undefined)).toEqual({ mult: 1, label: undefined });
    expect(noWarIndustryEdgeForDefender(ctx, "player-1", undefined)).toEqual({ mult: 1, label: undefined });
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
