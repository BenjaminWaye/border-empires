import { describe, expect, it } from "vitest";
import { SCOUT_DRONE_HOME_STEP_MS, planScoutDroneFlight } from "@border-empires/shared";
import { SCOUT_LAUNCH_MS, SCOUT_SPOOL_MS, createScoutDronePose, scoutDronePoseAt } from "./client-map-3d-scout-drone-pose.js";

// Over home land: one tile per SCOUT_DRONE_HOME_STEP_MS, so route speed is 1 tile/s.
const flight = planScoutDroneFlight({ x: 0, y: 0 }, { x: 12, y: 0 }, 0, {
  width: 100,
  height: 100,
  classify: (x) => (x <= 10 ? { kind: "HOME" } : { kind: "OPEN" })
})!;

describe("scout drone launch pose", () => {
  it("sits on the crown while the rotors spool up", () => {
    const pose = createScoutDronePose();
    scoutDronePoseAt(flight, SCOUT_SPOOL_MS * 0.9, 100, 100, pose);
    expect(pose.x).toBeCloseTo(0, 1);
    expect(pose.lift).toBe(0);
  });

  // Regression: the drone used to hold on the crown while the route clock ran on, then
  // sprint at about 3x route speed to catch up during the climb.
  it("never moves much faster than the route while it catches up after the spool", () => {
    const pose = createScoutDronePose();
    const routeSpeed = 1000 / SCOUT_DRONE_HOME_STEP_MS;
    const dt = 25;
    let previous = 0;
    let peak = 0;
    for (let ms = dt; ms <= SCOUT_LAUNCH_MS + 1_000; ms += dt) {
      scoutDronePoseAt(flight, ms, 100, 100, pose);
      peak = Math.max(peak, (Math.abs(pose.x - previous) * 1000) / dt);
      previous = pose.x;
    }
    expect(peak).toBeLessThan(routeSpeed * 1.6);
  });

  it("is back on the server's route once the launch is over", () => {
    const pose = createScoutDronePose();
    const at = SCOUT_LAUNCH_MS + 500;
    scoutDronePoseAt(flight, at, 100, 100, pose);
    const index = flight.steps.findIndex((step) => step.at > at) - 1;
    const from = flight.steps[index]!;
    const to = flight.steps[index + 1]!;
    expect(pose.x).toBeCloseTo(from.x + ((at - from.at) / (to.at - from.at)) * (to.x - from.x), 5);
  });
});
