import { describe, expect, it } from "vitest";
import {
  autoSettleCategoryForTile,
  DEFAULT_AUTO_SETTLE_PREFS,
  isAutoSettleAllowedForTile,
  NEW_PLAYER_AUTO_SETTLE_PREFS,
  normalizeAutoSettlePrefs
} from "./auto-settle-prefs.js";

describe("autoSettleCategoryForTile", () => {
  it("maps towns and docks to towns, food resources to food, other resources to resources", () => {
    expect(autoSettleCategoryForTile({ town: { name: "x" } })).toBe("towns");
    expect(autoSettleCategoryForTile({ dockId: "d1" })).toBe("towns");
    expect(autoSettleCategoryForTile({ resource: "FARM" })).toBe("food");
    expect(autoSettleCategoryForTile({ resource: "FISH" })).toBe("food");
    expect(autoSettleCategoryForTile({ resource: "TITANIUM" })).toBe("resources");
    expect(autoSettleCategoryForTile({ resource: "GEMS" })).toBe("resources");
    expect(autoSettleCategoryForTile({ resource: "UMBRITE" })).toBe("resources");
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
    const prefs = { answered: true, towns: true, food: false, resources: true };
    expect(isAutoSettleAllowedForTile(prefs, { town: {} })).toBe(true);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "FARM" })).toBe(false);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "GEMS" })).toBe(true);
  });
});

describe("normalizeAutoSettlePrefs", () => {
  it("falls back to legacy defaults on missing or malformed input", () => {
    expect(normalizeAutoSettlePrefs(undefined)).toEqual(DEFAULT_AUTO_SETTLE_PREFS);
    expect(normalizeAutoSettlePrefs({ towns: "yes" })).toEqual(DEFAULT_AUTO_SETTLE_PREFS);
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
