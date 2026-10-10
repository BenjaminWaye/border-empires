import { describe, expect, it } from "vitest";
import { FORT_TIER_LADDER, SIEGE_TIER_LADDER, structureBuildManpowerCost } from "@border-empires/shared";
import { structureInfoBuildMs, structureInfoRemovalMs } from "./client-structure-time-labels.js";
import { renderStructureInfoOverlay } from "../client-structure-info-overlay/client-structure-info-overlay.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";

describe("structure-info build and removal times", () => {
  it("gives each fort/siege tier its own build time, not the base Fort's", () => {
    expect(structureInfoBuildMs("THUNDER_BASTION", 0)).toBe(FORT_TIER_LADDER.THUNDER_BASTION.manpower * 1_000);
    expect(structureInfoBuildMs("THUNDER_BASTION", 0)).not.toBe(structureInfoBuildMs("FORT", 0));
    expect(structureInfoBuildMs("DREAD_TOWER", 0)).toBe(SIEGE_TIER_LADDER.DREAD_TOWER.manpower * 1_000);
  });

  it("removes at 0.5s per manpower point of the structure", () => {
    expect(structureInfoRemovalMs("TITANIUM_BASTION")).toBe(FORT_TIER_LADDER.TITANIUM_BASTION.manpower * 500);
    expect(structureInfoRemovalMs("MINTWORKS")).toBe(structureBuildManpowerCost("MINTWORKS") * 500);
  });

  it("shows the removal time on the structure info card", () => {
    const html = renderStructureInfoOverlay("MINTWORKS", () => ({
      title: "Mintworks", detail: "", effects: [], modifiers: [], glyph: "", placement: "Town", costBits: [], buildTimeLabel: "2m 30s"
    }));
    expect(html).toContain("<span>Removal time</span><strong>1m 15s</strong>");
  });
});

describe("buildTimeLabel", () => {
  it("shows seconds for short builds instead of rounding to 0m/1m", () => {
    expect(buildTimeLabel(0)).toBe("instant");
    expect(buildTimeLabel(30_000)).toBe("30s");
    expect(buildTimeLabel(80_000)).toBe("1m 20s");
    expect(buildTimeLabel(300_000)).toBe("5m");
  });
});
