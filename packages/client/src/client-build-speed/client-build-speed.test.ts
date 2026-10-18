import { describe, expect, it } from "vitest";
import { economicStructureBuildDurationMs, fortBuildDurationMs, relayBeaconBuildDurationMs, RELAY_BEACON_FIRST_TIER_COUNT } from "@border-empires/shared";
import { buildMsWithSpeedForState, buildSpeedMultForState, economicBuildMsForState, fortBuildMsForState, type BuildSpeedState } from "./client-build-speed.js";
import { structureInfoBuildMs } from "../client-structure-time-labels/client-structure-time-labels.js";
import type { DomainInfo, TechInfo } from "../client-tech-info-types.js";

const domain = (id: string, effects: Record<string, unknown>): DomainInfo => ({
  id, tier: 1, name: id, description: "", requiresTechId: "masonry", mods: {}, effects, requirements: { gold: 0, resources: {} }
});
const tech = (id: string, effects: Record<string, unknown>): TechInfo => ({
  id, name: id, tier: 1, description: "", mods: {}, effects, requirements: { gold: 0, resources: {} }
});
const speedState = (overrides: Partial<BuildSpeedState> = {}): BuildSpeedState => ({
  techIds: [], domainIds: [],
  techCatalog: [tech("fast-econ", { economicStructureBuildSpeedMult: 1.25 })],
  domainCatalog: [domain("titanium-bastions", { fortBuildSpeedMult: 1.5 })],
  ...overrides
});

describe("build menu times with tech/domain build-speed effects", () => {
  it("shows base times when the player has no speed effect", () => {
    const state = speedState();
    expect(fortBuildMsForState(state, "FORT")).toBe(fortBuildDurationMs("FORT"));
    expect(economicBuildMsForState(state, "MANUFACTORY")).toBe(economicStructureBuildDurationMs("MANUFACTORY"));
  });

  it("only counts effects the player has unlocked", () => {
    expect(buildSpeedMultForState(speedState(), "fortBuildSpeedMult")).toBe(1);
    expect(buildSpeedMultForState(speedState({ domainIds: ["titanium-bastions"] }), "fortBuildSpeedMult")).toBe(1.5);
  });

  it("shortens forts (every tier) by the fort speed effect and economic buildings by theirs", () => {
    const state = speedState({ domainIds: ["titanium-bastions"], techIds: ["fast-econ"] });
    expect(fortBuildMsForState(state, "FORT")).toBe(Math.round(fortBuildDurationMs("FORT") / 1.5));
    expect(fortBuildMsForState(state, "THUNDER_BASTION")).toBe(Math.round(fortBuildDurationMs("THUNDER_BASTION") / 1.5));
    expect(economicBuildMsForState(state, "MANUFACTORY")).toBe(Math.round(economicStructureBuildDurationMs("MANUFACTORY") / 1.25));
  });

  it("does not speed up a structure with no speed lever, and keeps instant builds instant", () => {
    const state = speedState({ domainIds: ["titanium-bastions"], techIds: ["fast-econ"] });
    const beaconMs = relayBeaconBuildDurationMs(RELAY_BEACON_FIRST_TIER_COUNT);
    expect(buildMsWithSpeedForState(state, "RELAY_BEACON", beaconMs)).toBe(beaconMs);
    expect(buildMsWithSpeedForState(state, "FORT", 0)).toBe(0);
  });

  it("applies the effect on the structure info card when given the viewer's state", () => {
    const state = speedState({ domainIds: ["titanium-bastions"] });
    expect(structureInfoBuildMs("TITANIUM_BASTION", 0, state)).toBe(Math.round(fortBuildDurationMs("TITANIUM_BASTION") / 1.5));
    expect(structureInfoBuildMs("TITANIUM_BASTION", 0)).toBe(fortBuildDurationMs("TITANIUM_BASTION"));
  });
});
