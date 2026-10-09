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
  return { me: "me", tiles } as unknown as ClientState;
};

describe("relay beacon build time in the build menu", () => {
  it("shows the first five beacons as instant", () => {
    expect(relayBeaconBuildTimeLabel(stateWithBeacons(0))).toBe("instant");
    expect(relayBeaconBuildTimeLabel(stateWithBeacons(4))).toBe("instant");
  });

  it("shows 60m (100 MP) from the sixth beacon on, not the stale 1m constant", () => {
    expect(relayBeaconBuildTimeLabel(stateWithBeacons(5))).toBe("60m");
  });

  it("prices the settle-then-build chain with the owned-count-aware beacon cost", () => {
    expect(buildManpowerCostForState(stateWithBeacons(0), "RELAY_BEACON")).toBe(50);
    expect(buildManpowerCostForState(stateWithBeacons(5), "RELAY_BEACON")).toBe(100);
    expect(buildDurationMsForState(stateWithBeacons(5), "RELAY_BEACON")).toBe(3_600_000);
  });
});
