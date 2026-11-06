import { describe, expect, it } from "vitest";
import { RAZED_WRECK_DURATION_MS, liveRazedWreck, razedWreckFieldsOnCapture } from "./razed-wreck.js";

const NOW = 1_000_000;

describe("razedWreckFieldsOnCapture", () => {
  it("leaves a 24h wreck for a standing Relay Beacon", () => {
    expect(razedWreckFieldsOnCapture({ economicStructure: { type: "RELAY_BEACON", status: "active" } }, NOW)).toEqual({ razedWreck: "RELAY_BEACON", razedWreckUntil: NOW + RAZED_WRECK_DURATION_MS });
  });

  it("leaves a siege engine's wreck by variant, defaulting to a Siege Battery", () => {
    expect(razedWreckFieldsOnCapture({ siegeBattery: { status: "active", variant: "SIEGE_TOWER" } }, NOW).razedWreck).toBe("SIEGE_TOWER");
    expect(razedWreckFieldsOnCapture({ siegeBattery: { status: "active" } }, NOW).razedWreck).toBe("SIEGE_BATTERY");
  });

  it("leaves nothing for a half-built structure or one that is not razed", () => {
    expect(razedWreckFieldsOnCapture({ economicStructure: { type: "RELAY_BEACON", status: "under_construction" } }, NOW)).toEqual({});
    expect(razedWreckFieldsOnCapture({ economicStructure: { type: "FUR_SYNTHESIZER", status: "active" } }, NOW)).toEqual({});
    expect(razedWreckFieldsOnCapture(undefined, NOW)).toEqual({});
  });

  it("keeps an earlier wreck through a later capture without restarting its clock", () => {
    const earlier = { razedWreck: "RELAY_BEACON", razedWreckUntil: NOW + 1_000 };
    expect(razedWreckFieldsOnCapture(earlier, NOW)).toEqual(earlier);
    expect(razedWreckFieldsOnCapture(earlier, NOW + 1_000)).toEqual({});
  });
});

describe("liveRazedWreck", () => {
  it("ignores unknown kinds and cleared wrecks", () => {
    expect(liveRazedWreck({ razedWreck: "FORT", razedWreckUntil: NOW + 1 }, NOW)).toBeUndefined();
    expect(liveRazedWreck({ razedWreck: "RELAY_BEACON", razedWreckUntil: NOW }, NOW)).toBeUndefined();
    expect(liveRazedWreck({ razedWreck: "RELAY_BEACON", razedWreckUntil: NOW + 1 }, NOW)).toBe("RELAY_BEACON");
  });
});
