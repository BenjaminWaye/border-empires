import { describe, expect, it } from "vitest";
import { NOW, dukeStatus, dukeSystem } from "../client-duke-panel/client-duke-fixtures.js";
import { smokeReason, systemMarkersFromStatus } from "./client-space-view-markers.js";

describe("systemMarkersFromStatus (§31)", () => {
  it("smokes any recently hit system, yours or a rival's; marks builds, Probes and bodies", () => {
    const status = dukeStatus({
      systems: [dukeSystem({ slot: { kind: "BASE", label: "Base", startedAt: NOW, completesAt: NOW + 1, bodyIndex: 2 } })],
      orbiting: [{ seasonId: "kel", label: "Kel" }],
      recentHits: [{ seasonId: "kel", at: NOW, by: "RAID" }]
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

describe("smokeReason", () => {
  it("says what got through and when, or nothing for a quiet planet", () => {
    const status = dukeStatus({ recentHits: [{ seasonId: "kel", at: NOW - 2 * 60 * 60 * 1000, by: "RAID" }] });
    expect(smokeReason(status, "kel", NOW)).toBe("Smoking: a rival's raid got through 2h ago and cost it 20 Stability.");
    expect(smokeReason(status, "s1", NOW)).toBeUndefined();
    expect(smokeReason(undefined, "kel", NOW)).toBeUndefined();
  });
});
