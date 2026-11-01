import { describe, expect, it } from "vitest";

import { buildDurationMsForState, buildManpowerCostForState, relayBeaconBuildTimeLabel } from "./client-relay-beacon-build-time.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const stateWithBeacons = (count: number): ClientState => {
  const tiles = new Map<string, Tile>();
  for (let i = 0; i < count; i++) {
    tiles.set(`${i},0`, {
      x: i,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
    });
  }
  return { me: "me", tiles, techIds: [], domainIds: [], techCatalog: [], domainCatalog: [] } as unknown as ClientState;
};

describe("relay beacon build time in the build menu", () => {
  it("shows the first five beacons as instant", () => {
    expect(relayBeaconBuildTimeLabel(stateWithBeacons(0))).toBe("instant");
    expect(relayBeaconBuildTimeLabel(stateWithBeacons(4))).toBe("instant");
  });

  it("shows the flat build minute from the sixth beacon on", () => {
    expect(relayBeaconBuildTimeLabel(stateWithBeacons(5))).toBe("1m");
  });

  it("prices the settle-then-build chain with the owned-count-aware beacon cost", () => {
    expect(buildManpowerCostForState(stateWithBeacons(0), "RELAY_BEACON")).toBe(50);
    expect(buildManpowerCostForState(stateWithBeacons(5), "RELAY_BEACON")).toBe(100);
    expect(buildDurationMsForState(stateWithBeacons(5), "RELAY_BEACON")).toBe(60_000);
  });

  it("applies the AFC Relay Beacon and universal manpower discounts", () => {
    const state = {
      ...stateWithBeacons(5),
      domainIds: ["afc-dominion-1", "afc-dominion-5"],
      domainCatalog: [
        { id: "afc-dominion-1", effects: { relayBeaconBuildManpowerCostMult: 1 / 3 } },
        { id: "afc-dominion-5", effects: { structureBuildManpowerCostMult: 0.5 } }
      ]
    } as unknown as ClientState;
    expect(buildManpowerCostForState(state, "RELAY_BEACON")).toBe(17);
    expect(buildManpowerCostForState(state, "MANUFACTORY")).toBe(Math.round(buildManpowerCostForState(stateWithBeacons(0), "MANUFACTORY") / 2));
  });
});
