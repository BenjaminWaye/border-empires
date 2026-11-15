// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { HouseChargeView, HouseChargesPayload } from "@border-empires/shared";
import type { FeedEntry } from "../client-types.js";
import { announceHouseChargeLosses } from "./client-house-charges-alerts.js";
import { houseChargesPanelHtml } from "./client-house-charges-panel.js";

const road: HouseChargeView = {
  id: "CHARTER:x",
  kind: "CHARTER",
  title: "Road of Vell and Harrowmere",
  rarity: "COMMON",
  renown: 2,
  kept: true,
  held: false,
  size: 0,
  lostAt: 50_000,
  searchCircle: { x: 19, y: 17, radius: 14 },
  targets: [{ key: "town:8,15", name: "Vell", x: 8, y: 15 }, { key: "town:30,20", name: "Harrowmere", x: 30, y: 20 }]
};
const payload = (charges: HouseChargeView[]): HouseChargesPayload => ({ type: "HOUSE_CHARGES", dealtAt: 1_000, choiceClosesAt: 2_000, charges });
const feedState = () => ({ feed: [] as FeedEntry[], feedUnreadCount: 0, feedAttentionUntil: 0, unreadAttackAlerts: 0, activePanel: null });

describe("House Charge loss warnings", () => {
  beforeEach(() => window.localStorage.clear());

  it("warns once per loss with Show on map, and not again on reconnect", () => {
    const state = feedState();
    expect(announceHouseChargeLosses(state as never, payload([road]))).toBe(1);
    expect(state.feed[0]).toMatchObject({ title: "House charge lost", severity: "warn", focusX: 8, focusY: 15, actionLabel: "Show on map" });
    expect(state.feed[0]!.text).toContain("Road of Vell and Harrowmere is no longer held");
    expect(announceHouseChargeLosses(state as never, payload([road]))).toBe(0);
    // A later, separate loss of the same charge warns again.
    expect(announceHouseChargeLosses(state as never, payload([{ ...road, lostAt: 90_000 }]))).toBe(1);
  });

  it("stays quiet for held, unkept or never-held charges", () => {
    const state = feedState();
    const { lostAt: _lost, ...neverHeld } = road;
    expect(announceHouseChargeLosses(state as never, payload([{ ...road, held: true }, { ...road, id: "b", kept: false }, { ...neverHeld, id: "c" }]))).toBe(0);
  });

  it("shows when a kept charge was lost in the panel", () => {
    const html = houseChargesPanelHtml({ activePanel: "charges", houseCharges: payload([road]), houseChargesDraftKeep: undefined }, 5_000);
    expect(html).toContain("house-charge-status is-lost");
    expect(html).toContain("Lost ");
  });
});
