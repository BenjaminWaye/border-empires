import { describe, expect, it } from "vitest";
import type { HouseChargeView } from "@border-empires/shared";
import { profileHtml, type ProfileInput } from "../client-hud-v2/client-hud-v2-profile.js";
import { houseChargeFocusPoint, houseChargesPanelHtml } from "./client-house-charges-panel.js";
import { applyHouseChargesMessage, createInitialHouseChargesState } from "./client-house-charges-state.js";

const charge = (overrides: Partial<HouseChargeView>): HouseChargeView => ({
  id: "CHARTER:town:8,15|town:30,20",
  kind: "CHARTER",
  title: "Road of Vell and Harrowmere",
  rarity: "COMMON",
  renown: 2,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 19, y: 17, radius: 14 },
  targets: [{ key: "town:8,15", name: "Vell", x: 8, y: 15 }, { key: "town:30,20", name: "Harrowmere", x: 30, y: 20 }],
  ...overrides
});

const relic = charge({ id: "RELIC:relic:20,25", kind: "RELIC", title: "A Concordance installation", rarity: "MYTHIC", renown: 4, targets: [], searchCircle: { x: 22, y: 24, radius: 9 } });
const desert = charge({ id: "DESERT:region:25,2", kind: "DESERT", title: "The Ashen Reach", kept: false, targets: [{ key: "region:25,2", name: "The Ashen Reach", x: 28, y: 4 }], areaTiles: 40 });

const message = (charges: HouseChargeView[], choiceClosesAt = 10_000) => ({ type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt, charges });

describe("House Charges client state", () => {
  it("applies a well-formed push and drops malformed charges", () => {
    const state = createInitialHouseChargesState();
    expect(applyHouseChargesMessage(state, message([charge({}), { id: 3 } as unknown as HouseChargeView]))).toBe(true);
    expect(state.houseCharges?.charges).toHaveLength(1);
    expect(applyHouseChargesMessage(state, { type: "HOUSE_CHARGES", charges: "nope" })).toBe(false);
    expect(state.houseCharges?.charges).toHaveLength(1);
  });

  it("clears a keep draft once the pushed list matches it", () => {
    const state = { ...createInitialHouseChargesState(), houseChargesDraftKeep: [charge({}).id, relic.id] };
    applyHouseChargesMessage(state, message([charge({}), { ...relic, kept: true }, desert]));
    expect(state.houseChargesDraftKeep).toBeUndefined();
  });
});

describe("House Charges panel", () => {
  const panelState = (charges: HouseChargeView[], choiceClosesAt = 10_000, draft?: string[]) => ({
    activePanel: "charges" as const,
    houseCharges: { type: "HOUSE_CHARGES" as const, dealtAt: 1_000, choiceClosesAt, charges },
    houseChargesDraftKeep: draft
  });

  it("explains the wait before charges are dealt", () => {
    expect(houseChargesPanelHtml({ activePanel: "charges", houseCharges: undefined, houseChargesDraftKeep: undefined }, 0)).toContain("arrive once your AFC has landed");
  });

  it("offers the keep choice while the window is open, and only enables saving a changed choice of two", () => {
    const charges = [charge({}), { ...relic, kept: true }, desert];
    const open = houseChargesPanelHtml(panelState(charges), 5_000);
    expect(open).toContain("Keep 2 of these 3");
    expect(open).toMatch(/data-house-charges-save disabled/);
    const changed = houseChargesPanelHtml(panelState(charges, 10_000, [charge({}).id, desert.id]), 5_000);
    expect(changed).not.toMatch(/data-house-charges-save disabled/);
    const closed = houseChargesPanelHtml(panelState(charges), 20_000);
    expect(closed).not.toContain("data-house-charge-keep");
    expect(closed).toContain("Not kept");
  });

  it("shows held charges and an undiscovered relic without naming its place", () => {
    const html = houseChargesPanelHtml(panelState([charge({ held: true, size: 28, completeSince: 2_000 }), { ...relic, kept: true }], 0), 5_000);
    expect(html).toContain("Road complete: 28 tiles");
    expect(html).toContain("Beacon not found yet");
    expect(html).toContain("Find the Concordance installation");
  });

  it("points Show on map at the target once known, otherwise at the search circle", () => {
    expect(houseChargeFocusPoint(charge({}))).toEqual(expect.objectContaining({ x: 8, y: 15 }));
    expect(houseChargeFocusPoint(relic)).toEqual({ x: 22, y: 24, radius: 9 });
  });

});

describe("House Charges in the profile", () => {
  const profile = (overrides: Partial<ProfileInput>): string =>
    profileHtml({
      id: "p1",
      name: "House Alden",
      color: "#b23a34",
      relation: { kind: "self" },
      entry: undefined,
      career: undefined,
      holdings: undefined,
      pacts: undefined,
      truceBreaks: undefined,
      nameOf: () => undefined,
      nowMs: 5_000,
      ...overrides
    });

  it("lists your kept charges with a Manage button on your own profile", () => {
    const html = profile({ houseCharges: { type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 10_000, charges: [charge({ held: true }), { ...relic, kept: true }, desert] } });
    expect(html).toContain("House Charges");
    expect(html).toContain("Road of Vell and Harrowmere");
    expect(html).toContain("A Concordance installation");
    expect(html).not.toContain("The Ashen Reach");
    expect(html).toContain("data-v2-open-charges");
    expect(html).toContain("You can still change which 2 you keep.");
  });

  it("explains the wait on your own profile before charges are dealt", () => {
    expect(profile({ houseCharges: null })).toContain("arrive once your AFC has landed");
  });

  it("never shows a section on another player's profile", () => {
    const html = profile({ id: "p2", relation: { kind: "none" } });
    expect(html).not.toContain("House Charges");
    expect(html).not.toContain("data-v2-open-charges");
  });
});
