import { describe, expect, it } from "vitest";
import { NOW, dukeStatus, dukeSystem } from "../client-duke-panel/client-duke-fixtures.js";
import { systemMarkersFromStatus } from "./client-space-view-markers.js";

describe("systemMarkersFromStatus (§31)", () => {
  it("smokes any recently hit system, yours or a rival's; marks builds, Probes and bodies", () => {
    const status = dukeStatus({
      systems: [dukeSystem({ slot: { kind: "BASE", label: "Base", startedAt: NOW, completesAt: NOW + 1, bodyIndex: 2 } })],
      orbiting: [{ seasonId: "kel", label: "Kel" }],
      recentHits: [{ seasonId: "kel", at: NOW }]
    });
    const markers = systemMarkersFromStatus(status);
    expect(markers.get("kel")).toMatchObject({ smoking: true, watched: true, building: false });
    expect(markers.get("s1")).toMatchObject({
      smoking: false,
      building: true,
      bodies: [
        { base: true, developed: false, building: false },
        { base: true, developed: true, building: false },
        { base: false, developed: false, building: true }
      ]
    });
    expect(systemMarkersFromStatus(undefined).size).toBe(0);
  });
});
