import { describe, expect, it } from "vitest";
import { RELAY_BEACON_FREE_FOOD_SLOT_COUNT } from "@border-empires/shared";

import { upkeepDescriptorFor, upkeepSuffixFor } from "./client-structure-upkeep-text.js";

describe("upkeepDescriptorFor", () => {
  it("Farmstead has no ongoing upkeep at all", () => {
    expect(upkeepDescriptorFor("FARMSTEAD")).toEqual([]);
  });

  it("Titanium Works shows both its TITANIUM slot and its real gold/day drain", () => {
    expect(upkeepDescriptorFor("TITANIUM_WORKS")).toEqual(["1 TITANIUM slot", "30 gold/day"]);
  });

  it("Advanced Crystal Synthesizer shows its CRYSTAL slot and its 60 gold/day drain", () => {
    expect(upkeepDescriptorFor("ADVANCED_CRYSTAL_SYNTHESIZER")).toEqual(["1 CRYSTAL slot", "60 gold/day"]);
  });

  it("Airport has no gold/day upkeep -- only its real 3 CRYSTAL slots", () => {
    expect(upkeepDescriptorFor("AIRPORT")).toEqual(["3 CRYSTAL slots"]);
  });

  it("a first-built Observatory costs 1 CRYSTAL slot", () => {
    expect(upkeepDescriptorFor("OBSERVATORY", 0)).toEqual(["1 CRYSTAL slot"]);
  });

  it("a second Observatory costs 2 CRYSTAL slots", () => {
    expect(upkeepDescriptorFor("OBSERVATORY", 1)).toEqual(["2 CRYSTAL slots"]);
  });

  it("a third Observatory costs 3 CRYSTAL slots", () => {
    expect(upkeepDescriptorFor("OBSERVATORY", 2)).toEqual(["3 CRYSTAL slots"]);
  });

  it("omits the FOOD slot line for a Relay Beacon within the free waiver count", () => {
    expect(upkeepDescriptorFor("RELAY_BEACON", RELAY_BEACON_FREE_FOOD_SLOT_COUNT - 1)).toEqual([]);
  });

  it("shows the FOOD slot line for a Relay Beacon past the free waiver count", () => {
    expect(upkeepDescriptorFor("RELAY_BEACON", RELAY_BEACON_FREE_FOOD_SLOT_COUNT)).toEqual(["1 FOOD slot"]);
  });

  it("Siege Tower joins its two resource requirements", () => {
    expect(upkeepDescriptorFor("SIEGE_TOWER")).toEqual(["2 UMBRITE slots", "1 TITANIUM slot"]);
  });
});

describe("upkeepSuffixFor", () => {
  it("returns an empty string for a no-upkeep structure", () => {
    expect(upkeepSuffixFor("WATERWORKS")).toBe("");
  });

  it("formats a single bit as a labeled Upkeep segment", () => {
    expect(upkeepSuffixFor("MINE")).toBe(" • Upkeep: 1 FOOD slot");
  });

  it("joins multiple bits with a middle dot", () => {
    expect(upkeepSuffixFor("TITANIUM_WORKS")).toBe(" • Upkeep: 1 TITANIUM slot · 30 gold/day");
  });
});
