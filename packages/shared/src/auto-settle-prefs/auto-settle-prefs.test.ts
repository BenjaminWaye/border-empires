import { describe, expect, it } from "vitest";
import {
  autoSettleCategoryForTile,
  DEFAULT_AUTO_SETTLE_PREFS,
  isAutoSettleAllowedForTile,
  NEW_PLAYER_AUTO_SETTLE_PREFS,
  normalizeAutoSettlePrefs
} from "./auto-settle-prefs.js";

describe("autoSettleCategoryForTile", () => {
  it("maps towns and docks to towns, food to food, titanium/umbrite/gems to strategic, everything else to luxury", () => {
    expect(autoSettleCategoryForTile({ town: { name: "x" } })).toBe("towns");
    expect(autoSettleCategoryForTile({ dockId: "d1" })).toBe("towns");
    expect(autoSettleCategoryForTile({ resource: "FARM" })).toBe("food");
    expect(autoSettleCategoryForTile({ resource: "FISH" })).toBe("food");
    expect(autoSettleCategoryForTile({ resource: "TITANIUM" })).toBe("strategic");
    expect(autoSettleCategoryForTile({ resource: "UMBRITE" })).toBe("strategic");
    expect(autoSettleCategoryForTile({ resource: "GEMS" })).toBe("strategic");
    expect(autoSettleCategoryForTile({ resource: "LUXURY_BIOTA" })).toBe("luxury");
    expect(autoSettleCategoryForTile({ resource: "NEURAL_RESIN" })).toBe("luxury");
  });

  it("puts a town that also carries a resource under towns, and plain support tiles under towns", () => {
    expect(autoSettleCategoryForTile({ town: {}, resource: "FARM" })).toBe("towns");
    expect(autoSettleCategoryForTile({})).toBe("towns");
  });
});

describe("isAutoSettleAllowedForTile", () => {
  it("allows everything for the explicit legacy/AI default prefs", () => {
    expect(isAutoSettleAllowedForTile(DEFAULT_AUTO_SETTLE_PREFS, { resource: "FARM" })).toBe(true);
  });
  it("blocks every category for a new player until they answer", () => {
    expect(isAutoSettleAllowedForTile(NEW_PLAYER_AUTO_SETTLE_PREFS, { town: {} })).toBe(false);
    expect(isAutoSettleAllowedForTile(NEW_PLAYER_AUTO_SETTLE_PREFS, { resource: "FISH" })).toBe(false);
  });
  it("gates each category independently", () => {
    const prefs = { answered: true, towns: true, food: false, strategic: true, luxury: false };
    expect(isAutoSettleAllowedForTile(prefs, { town: {} })).toBe(true);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "FARM" })).toBe(false);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "TITANIUM" })).toBe(true);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "GEMS" })).toBe(true);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "PRECURSOR_SALVAGE" })).toBe(false);
  });
});

describe("normalizeAutoSettlePrefs", () => {
  it("falls back to legacy defaults on missing or malformed input", () => {
    expect(normalizeAutoSettlePrefs(undefined)).toEqual(DEFAULT_AUTO_SETTLE_PREFS);
    expect(normalizeAutoSettlePrefs({ towns: "yes" })).toEqual(DEFAULT_AUTO_SETTLE_PREFS);
  });
  it("splits a value stored before the strategic/luxury split from its single resources switch", () => {
    expect(normalizeAutoSettlePrefs({ answered: true, towns: true, food: false, resources: false })).toEqual({
      answered: true,
      towns: true,
      food: false,
      strategic: false,
      luxury: false
    });
    expect(normalizeAutoSettlePrefs({ answered: true, towns: false, food: false, resources: true })).toMatchObject({ strategic: true, luxury: true });
  });
  it("preserves an unanswered new-player value", () => {
    expect(normalizeAutoSettlePrefs({ ...NEW_PLAYER_AUTO_SETTLE_PREFS })).toEqual(NEW_PLAYER_AUTO_SETTLE_PREFS);
  });
});

describe("isAutoSettleAllowedForTile typing", () => {
  it("requires prefs: passing undefined does not compile (and throws rather than allowing)", () => {
    // @ts-expect-error prefs are required: there is no implicit all-on value.
    expect(() => isAutoSettleAllowedForTile(undefined, { resource: "FARM" })).toThrow();
  });
});
