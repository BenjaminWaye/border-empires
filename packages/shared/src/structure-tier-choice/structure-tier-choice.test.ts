import { describe, expect, it } from "vitest";
import { bestFortTierForTech, bestSiegeTierForTech } from "../structure-costs/structure-costs.js";
import { FORT_TIER_ORDER, SIEGE_TIER_ORDER, fortTierForChoice, isChosenStructureTier, siegeTierForChoice } from "./structure-tier-choice.js";

const techs = (...ids: string[]) => (id: string) => ids.includes(id);

describe("fortTierForChoice", () => {
  it("lets a player pick a lower tier than their best on bare ground", () => {
    const result = fortTierForChoice("FORT", undefined, techs("masonry", "fortified-walls", "steelworking"));
    expect(result).toMatchObject({ ok: true, tier: { variant: "FORT" } });
  });

  it("rejects a tier the tech does not reach", () => {
    expect(fortTierForChoice("TITANIUM_BASTION", undefined, techs("masonry"))).toEqual({ ok: false, reason: "research the Titanium Bastion first" });
  });

  it("allows any unlocked tier over a Palisade", () => {
    expect(fortTierForChoice("TITANIUM_BASTION", "PALISADE", techs("masonry", "fortified-walls"))).toMatchObject({ ok: true, tier: { variant: "TITANIUM_BASTION" } });
  });

  it("only upgrades upward over a real fort, and may skip a tier", () => {
    const all = techs("masonry", "fortified-walls", "steelworking");
    expect(fortTierForChoice("THUNDER_BASTION", "FORT", all)).toMatchObject({ ok: true, tier: { variant: "THUNDER_BASTION" } });
    expect(fortTierForChoice("FORT", "FORT", all)).toEqual({ ok: false, reason: "tile already has a Fort" });
    expect(fortTierForChoice("FORT", "TITANIUM_BASTION", all)).toEqual({ ok: false, reason: "tile already has a stronger Titanium Bastion" });
  });

  it("unlocks exactly the tiers up to the default best-tier build", () => {
    for (const owned of [[], ["fortified-walls"], ["fortified-walls", "steelworking"]]) {
      const has = techs("masonry", ...owned);
      const best = FORT_TIER_ORDER.indexOf(bestFortTierForTech(has).variant);
      for (const tier of ["FORT", "TITANIUM_BASTION", "THUNDER_BASTION"] as const) {
        expect(fortTierForChoice(tier, undefined, has).ok).toBe(FORT_TIER_ORDER.indexOf(tier) <= best);
      }
    }
  });
});

describe("siegeTierForChoice", () => {
  it("lets a player pick a Siege Battery with Dread Tower tech", () => {
    expect(siegeTierForChoice("SIEGE_BATTERY", undefined, techs("leatherworking", "siegecraft", "standing-army"))).toMatchObject({ ok: true, tier: { variant: "SIEGE_BATTERY" } });
  });

  it("rejects an unresearched tier and a non-upgrade", () => {
    expect(siegeTierForChoice("DREAD_TOWER", undefined, techs("siegecraft"))).toEqual({ ok: false, reason: "research the Dread Tower first" });
    expect(siegeTierForChoice("SIEGE_TOWER", "SIEGE_TOWER", techs("siegecraft"))).toEqual({ ok: false, reason: "tile already has a Siege Tower" });
  });

  it("unlocks exactly the tiers up to the default best-tier build", () => {
    for (const owned of [[], ["siegecraft"], ["siegecraft", "standing-army"]]) {
      const has = techs(...owned);
      const best = SIEGE_TIER_ORDER.indexOf(bestSiegeTierForTech(has).variant);
      for (const tier of SIEGE_TIER_ORDER) expect(siegeTierForChoice(tier, undefined, has).ok).toBe(SIEGE_TIER_ORDER.indexOf(tier) <= best);
    }
  });
});

describe("isChosenStructureTier", () => {
  it("accepts non-Palisade fort tiers and siege tiers only", () => {
    expect(["FORT", "TITANIUM_BASTION", "THUNDER_BASTION", "SIEGE_BATTERY", "SIEGE_TOWER", "DREAD_TOWER"].every(isChosenStructureTier)).toBe(true);
    expect(["PALISADE", "RELAY_BEACON", "", 3, undefined].some(isChosenStructureTier)).toBe(false);
  });
});
