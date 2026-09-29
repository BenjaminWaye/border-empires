import { describe, expect, test } from "vitest";

import { FORT_TIER_LADDER, defendingFortVariant, fortTierForBuild, isFortDefending } from "./structure-costs.js";

const techs = (...ids: string[]) => (id: string) => ids.includes(id);

describe("fortTierForBuild", () => {
  test("a Palisade builds only on a tile with no fortification", () => {
    expect(fortTierForBuild("WOODEN_FORT", undefined, techs())).toBe(FORT_TIER_LADDER.WOODEN_FORT);
    expect(fortTierForBuild("WOODEN_FORT", "WOODEN_FORT", techs())).toBeNull();
    expect(fortTierForBuild("WOODEN_FORT", "FORT", techs())).toBeNull();
  });

  test("a fort build on bare ground or over a Palisade goes to the best tier the tech allows", () => {
    expect(fortTierForBuild("FORT", undefined, techs("masonry"))).toBe(FORT_TIER_LADDER.FORT);
    expect(fortTierForBuild("FORT", "WOODEN_FORT", techs("masonry"))).toBe(FORT_TIER_LADDER.FORT);
    expect(fortTierForBuild("FORT", "WOODEN_FORT", techs("masonry", "fortified-walls"))).toBe(FORT_TIER_LADDER.TITANIUM_BASTION);
  });

  test("a fort build over a real fort climbs one tier, or null at the top / without the tech", () => {
    expect(fortTierForBuild("FORT", "FORT", techs("masonry", "fortified-walls"))).toBe(FORT_TIER_LADDER.TITANIUM_BASTION);
    expect(fortTierForBuild("FORT", "FORT", techs("masonry"))).toBeNull();
    expect(fortTierForBuild("FORT", "THUNDER_BASTION", techs("masonry", "fortified-walls", "steelworking"))).toBeNull();
  });
});

describe("defendingFortVariant / isFortDefending", () => {
  test("an active fort defends as its own tier", () => {
    const fort = { status: "active", variant: "TITANIUM_BASTION" as const };
    expect(isFortDefending(fort)).toBe(true);
    expect(defendingFortVariant(fort)).toBe("TITANIUM_BASTION");
  });

  test("a fort mid-upgrade keeps defending as the tier it's upgrading from", () => {
    const fort = { status: "under_construction", variant: "FORT" as const, upgradingFrom: "WOODEN_FORT" as const };
    expect(isFortDefending(fort)).toBe(true);
    expect(defendingFortVariant(fort)).toBe("WOODEN_FORT");
  });

  test("a fresh construction, a removal, or no fort doesn't defend", () => {
    expect(isFortDefending({ status: "under_construction", variant: "FORT" })).toBe(false);
    expect(defendingFortVariant({ status: "under_construction", variant: "FORT" })).toBeUndefined();
    expect(isFortDefending({ status: "removing", variant: "FORT" })).toBe(false);
    expect(isFortDefending(undefined)).toBe(false);
    expect(isFortDefending(null)).toBe(false);
  });
});
