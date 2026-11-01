import { describe, expect, it } from "vitest";
import { STRUCTURE_BUILD_MS, STRUCTURE_REMOVAL_MS } from "@border-empires/shared";
import { structureInfoBuildMs, structureInfoRemovalMs } from "./client-structure-time-labels.js";
import { renderStructureInfoOverlay } from "../client-structure-info-overlay/client-structure-info-overlay.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";

describe("structure-info build and removal times", () => {
  it("gives every fort/siege tier the flat build minute", () => {
    expect(structureInfoBuildMs("THUNDER_BASTION", 0)).toBe(STRUCTURE_BUILD_MS);
    expect(structureInfoBuildMs("FORT", 0)).toBe(STRUCTURE_BUILD_MS);
    expect(structureInfoBuildMs("DREAD_TOWER", 0)).toBe(STRUCTURE_BUILD_MS);
  });

  it("removes in the flat 30 seconds", () => {
    expect(structureInfoRemovalMs("TITANIUM_BASTION")).toBe(STRUCTURE_REMOVAL_MS);
    expect(structureInfoRemovalMs("MANUFACTORY")).toBe(STRUCTURE_REMOVAL_MS);
  });

  it("shows the removal time on the structure info card", () => {
    const html = renderStructureInfoOverlay("MANUFACTORY", () => ({
      title: "Manufactory", detail: "", effects: [], modifiers: [], glyph: "", placement: "Town", costBits: [], buildTimeLabel: "1m"
    }));
    expect(html).toContain("<span>Removal time</span><strong>30s</strong>");
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
