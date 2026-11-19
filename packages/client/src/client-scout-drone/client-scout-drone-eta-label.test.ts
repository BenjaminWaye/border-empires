import { describe, expect, it } from "vitest";
import type { ScoutDroneFlight } from "@border-empires/shared";
import { scoutDroneEtaText } from "./client-scout-drone-eta-label.js";

const flight: ScoutDroneFlight = { launchedAt: 0, landsAt: 171_000, targetX: 5, targetY: 5, steps: [{ x: 0, y: 0, at: 0 }], turnIndex: 0, endReason: "TARGET" };

describe("scoutDroneEtaText", () => {
  it("counts down to when the drone is back", () => {
    expect(scoutDroneEtaText(flight, 0)).toBe("Back in 2m 51s");
    expect(scoutDroneEtaText(flight, 165_500)).toBe("Back in 6s");
  });

  it("is gone once the drone has docked, or with no drone out", () => {
    expect(scoutDroneEtaText(flight, 171_000)).toBeUndefined();
    expect(scoutDroneEtaText(undefined, 0)).toBeUndefined();
  });
});
