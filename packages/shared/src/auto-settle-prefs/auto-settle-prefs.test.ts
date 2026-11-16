import { describe, expect, it } from "vitest";
import {
  AUTO_SETTLE_CATEGORIES,
  autoSettleCategoryForTile,
  autoSettlePrefsCommandPayload,
  autoSettlePrefsForOutput,
  DEFAULT_AUTO_SETTLE_PREFS,
  isAutoSettleAllowedForTile,
  NEW_PLAYER_AUTO_SETTLE_PREFS,
  normalizeAutoSettlePrefs,
  parseAutoSettleCategoryPrefs,
  type AutoSettleCategoryPrefs
} from "./auto-settle-prefs.js";
import { autoImproveStructureForResource, NO_AUTO_IMPROVE, parseAutoImprovePrefs } from "./auto-improve-prefs.js";

const off = { improve: { ...NO_AUTO_IMPROVE } };

const only = (...on: string[]): AutoSettleCategoryPrefs =>
  Object.fromEntries(AUTO_SETTLE_CATEGORIES.map((category) => [category, on.includes(category)])) as AutoSettleCategoryPrefs;

describe("autoSettleCategoryForTile", () => {
  it("maps towns and docks to towns and every resource tile to its own resource", () => {
    expect(autoSettleCategoryForTile({ town: { name: "x" } })).toBe("towns");
    expect(autoSettleCategoryForTile({ dockId: "d1" })).toBe("towns");
    expect(autoSettleCategoryForTile({ resource: "FARM" })).toBe("FARM");
    expect(autoSettleCategoryForTile({ resource: "FISH" })).toBe("FISH");
    expect(autoSettleCategoryForTile({ resource: "TITANIUM" })).toBe("TITANIUM");
    expect(autoSettleCategoryForTile({ resource: "GEMS" })).toBe("GEMS");
    expect(autoSettleCategoryForTile({ resource: "PRECURSOR_SALVAGE" })).toBe("PRECURSOR_SALVAGE");
  });

  it("puts a town that also carries a resource under towns, and plain support tiles under towns", () => {
    expect(autoSettleCategoryForTile({ town: {}, resource: "FARM" })).toBe("towns");
    expect(autoSettleCategoryForTile({})).toBe("towns");
  });
});

describe("isAutoSettleAllowedForTile", () => {
  it("allows everything for the explicit legacy/AI default prefs", () => {
    expect(isAutoSettleAllowedForTile(DEFAULT_AUTO_SETTLE_PREFS, { resource: "FARM" })).toBe(true);
    expect(isAutoSettleAllowedForTile(DEFAULT_AUTO_SETTLE_PREFS, { resource: "PRECURSOR_SALVAGE" })).toBe(true);
  });
  it("blocks every category for a new player until they answer", () => {
    expect(isAutoSettleAllowedForTile(NEW_PLAYER_AUTO_SETTLE_PREFS, { town: {} })).toBe(false);
    expect(isAutoSettleAllowedForTile(NEW_PLAYER_AUTO_SETTLE_PREFS, { resource: "FISH" })).toBe(false);
  });
  it("garrisons only titanium when only titanium is on", () => {
    const prefs = only("TITANIUM");
    expect(isAutoSettleAllowedForTile(prefs, { resource: "TITANIUM" })).toBe(true);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "UMBRITE" })).toBe(false);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "GEMS" })).toBe(false);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "PRECURSOR_SALVAGE" })).toBe(false);
    expect(isAutoSettleAllowedForTile(prefs, { town: {} })).toBe(false);
  });
  it("garrisons only salvage sites when only salvage is on", () => {
    const prefs = only("PRECURSOR_SALVAGE");
    expect(isAutoSettleAllowedForTile(prefs, { resource: "PRECURSOR_SALVAGE" })).toBe(true);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "LUXURY_BIOTA" })).toBe(false);
    expect(isAutoSettleAllowedForTile(prefs, { resource: "TITANIUM" })).toBe(false);
  });
});

describe("parseAutoSettleCategoryPrefs", () => {
  it("reads per-resource switches", () => {
    expect(parseAutoSettleCategoryPrefs(only("towns", "FISH"))).toEqual(only("towns", "FISH"));
  });
  it("rejects a value with neither a resource's own switch nor its old group switch", () => {
    expect(parseAutoSettleCategoryPrefs({ towns: true, FARM: true })).toBeUndefined();
  });
});

describe("normalizeAutoSettlePrefs", () => {
  it("falls back to legacy defaults on missing or malformed input", () => {
    expect(normalizeAutoSettlePrefs(undefined)).toEqual(DEFAULT_AUTO_SETTLE_PREFS);
    expect(normalizeAutoSettlePrefs({ towns: "yes" })).toEqual(DEFAULT_AUTO_SETTLE_PREFS);
  });
  it("carries a food/strategic/luxury value over to each resource in those groups", () => {
    expect(normalizeAutoSettlePrefs({ answered: true, towns: true, food: false, strategic: true, luxury: false })).toEqual({
      answered: true,
      ...only("towns", "TITANIUM", "UMBRITE", "GEMS"),
      ...off
    });
  });
  it("carries a value stored before the strategic/luxury split over from its single resources switch", () => {
    expect(normalizeAutoSettlePrefs({ answered: true, towns: true, food: false, resources: false })).toEqual({ answered: true, ...only("towns"), ...off });
    expect(normalizeAutoSettlePrefs({ answered: true, towns: false, food: false, resources: true })).toMatchObject({ TITANIUM: true, PRECURSOR_SALVAGE: true, FARM: false });
  });
  it("lets a resource's own switch override its old group switch", () => {
    expect(normalizeAutoSettlePrefs({ towns: false, food: false, strategic: false, luxury: false, TITANIUM: true })).toEqual({ answered: true, ...only("TITANIUM"), ...off });
  });
  it("preserves an unanswered new-player value", () => {
    expect(normalizeAutoSettlePrefs({ ...NEW_PLAYER_AUTO_SETTLE_PREFS })).toEqual(NEW_PLAYER_AUTO_SETTLE_PREFS);
  });
});

describe("auto-improve prefs", () => {
  it("maps each improvable resource to its improvement, and fish to none", () => {
    // Strategic deposits take no on-tile improvement (a town refinery processes the field).
    expect(autoImproveStructureForResource("TITANIUM")).toBeUndefined();
    expect(autoImproveStructureForResource("UMBRITE")).toBeUndefined();
    expect(autoImproveStructureForResource("GEMS")).toBeUndefined();
    expect(autoImproveStructureForResource("FARM")).toBe("HYDROGARDEN");
    expect(autoImproveStructureForResource("PRECURSOR_SALVAGE")).toBe("RECLAMATION_WORKS");
    expect(autoImproveStructureForResource("FISH")).toBeUndefined();
  });
  it("is off for stored prefs that predate it, and reads the switches when present", () => {
    expect(normalizeAutoSettlePrefs({ answered: true, ...only("towns") }).improve).toEqual(NO_AUTO_IMPROVE);
    expect(normalizeAutoSettlePrefs({ answered: true, ...only("towns"), improve: { FARM: true } }).improve).toEqual({ ...NO_AUTO_IMPROVE, FARM: true });
    expect(parseAutoImprovePrefs({ FARM: "yes" })).toBeUndefined();
    // A saved switch for a strategic deposit (Mine/Umbrite Rig era) is dropped.
    expect(normalizeAutoSettlePrefs({ answered: true, ...only("towns"), improve: { TITANIUM: true } }).improve).toEqual(NO_AUTO_IMPROVE);
  });
});

describe("autoSettlePrefsForOutput", () => {
  it("adds food/strategic/luxury group switches that are on only when every resource in the group is", () => {
    const out = autoSettlePrefsForOutput({ answered: true, ...only("towns", "FARM", "FISH", "TITANIUM"), ...off });
    expect(out).toMatchObject({ food: true, strategic: false, luxury: false, TITANIUM: true });
  });
  it("keeps an opted-out player opted out for a reader from before the per-resource split (no all-on fallback)", () => {
    const out = autoSettlePrefsForOutput({ ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true });
    // The old reader required towns + food + strategic/luxury booleans and fell back to all-on otherwise.
    const legacyRead = { towns: out.towns, food: out.food, strategic: out.strategic, luxury: out.luxury };
    expect(legacyRead).toEqual({ towns: false, food: false, strategic: false, luxury: false });
  });
  it("round-trips: per-resource keys win over the added group keys", () => {
    const prefs = { answered: true, ...only("TITANIUM"), ...off };
    expect(normalizeAutoSettlePrefs(autoSettlePrefsForOutput(prefs))).toEqual(prefs);
  });
});

describe("autoSettlePrefsCommandPayload", () => {
  it("forwards every per-resource switch and any legacy grouped ones, dropping the message type", () => {
    expect(autoSettlePrefsCommandPayload({ type: "SET_AUTO_SETTLE_PREFS", ...only("TITANIUM") })).toEqual(only("TITANIUM"));
    expect(autoSettlePrefsCommandPayload({ type: "SET_AUTO_SETTLE_PREFS", towns: true, food: false, resources: true })).toEqual({ towns: true, food: false, resources: true });
    // Forwarded as sent, so the sim changes only the named switches.
    expect(autoSettlePrefsCommandPayload({ type: "SET_AUTO_SETTLE_PREFS", ...only(), improve: { FARM: true } })).toEqual({ ...only(), improve: { FARM: true } });
  });
});

describe("isAutoSettleAllowedForTile typing", () => {
  it("requires prefs: passing undefined does not compile (and throws rather than allowing)", () => {
    // @ts-expect-error prefs are required: there is no implicit all-on value.
    expect(() => isAutoSettleAllowedForTile(undefined, { resource: "FARM" })).toThrow();
  });
});
