import { describe, expect, it } from "vitest";
import {
  POD_CHAMBER_Y,
  POD_EXIT_Y,
  POD_MAX_Y,
  planPodFlight,
  podCratesDelivered,
  podLeanAt,
  podPositionAt,
  podPrintedAt,
  podStageAt,
  podThrottleAt,
  type PodFlightPlan
} from "./client-map-3d-construction-pod-flight.js";

// Parts are fabricated at the owner's AFC and flown to the site; nothing drops from orbit.
const at = (plan: PodFlightPlan, age: number) => podPositionAt(plan, age, { x: 0, y: 0, z: 0 });

describe("construction pod flight", () => {
  const plan = planPodFlight(-6, -4); // the AFC is 6 west, 4 north of the site

  it("is printed inside the AFC's glass chamber before anything moves", () => {
    expect(podStageAt(plan, 0)).toBe("fabricate");
    expect(at(plan, 0)).toEqual({ x: -6, y: POD_CHAMBER_Y, z: -4 });
    expect(at(plan, plan.liftAtMs - 1)).toEqual({ x: -6, y: POD_CHAMBER_Y, z: -4 });
    expect(podPrintedAt(plan, 0)).toBe(0);
    expect(podPrintedAt(plan, plan.liftAtMs)).toBe(1);
    expect(podThrottleAt(plan, plan.liftAtMs / 2)).toBe(0); // no engine inside the chamber
  });

  it("is kicked straight up out of the AFC's crown, then arcs over to hover above the stack", () => {
    expect(podStageAt(plan, plan.liftAtMs + 1)).toBe("lift");
    const exit = at(plan, plan.cruiseAtMs);
    expect(exit.x).toBe(-6);
    expect(exit.y).toBeCloseTo(POD_EXIT_Y, 5);
    // A fast kick: most of the climb happens in the first half of the lift.
    const halfLift = at(plan, (plan.liftAtMs + plan.cruiseAtMs) / 2);
    expect(halfLift.y - POD_CHAMBER_Y).toBeGreaterThan(0.75 * (POD_EXIT_Y - POD_CHAMBER_Y));

    const mid = at(plan, (plan.cruiseAtMs + plan.descentAtMs) / 2);
    expect(Math.abs(mid.x)).toBeLessThan(6);
    expect(Math.abs(mid.x)).toBeGreaterThan(0);
    expect(mid.y).toBeGreaterThan(POD_EXIT_Y);

    const hover = at(plan, plan.descentAtMs);
    expect(Math.hypot(hover.x, hover.z)).toBeLessThan(1e-6);
    expect(hover.y).toBeGreaterThan(0.3);
  });

  it("comes straight down onto the stack and touches down softly", () => {
    const halfway = at(plan, (plan.descentAtMs + plan.touchdownAtMs) / 2);
    expect(halfway.x).toBe(0);
    expect(halfway.z).toBe(0);
    expect(at(plan, plan.touchdownAtMs).y).toBeCloseTo(0, 5);
    // Braking: the last 10% of the descent covers far less than a tenth of the drop.
    const nearly = at(plan, plan.touchdownAtMs - 54).y;
    expect(nearly).toBeLessThan(0.03);
    expect(podThrottleAt(plan, plan.touchdownAtMs - 1)).toBeGreaterThan(0.5); // still burning
    expect(podThrottleAt(plan, plan.touchdownAtMs)).toBe(0);
    expect(podStageAt(plan, plan.touchdownAtMs)).toBe("unpack");
    expect(podStageAt(plan, plan.endAtMs)).toBe("done");
  });

  it("never comes from orbit: an atmospheric hop capped well below the old 3-tile drop", () => {
    for (const distance of [1, 4, 12, 60]) {
      const far = planPodFlight(-distance, 0);
      let highest = 0;
      for (let t = 0; t < far.endAtMs; t += 20) highest = Math.max(highest, at(far, t).y);
      expect(highest).toBeLessThanOrEqual(POD_MAX_Y + 1e-9);
      expect(highest).toBeLessThan(2.6);
    }
  });

  it("flies farther sites for longer and higher, with no cap on the trip time", () => {
    const near = planPodFlight(-2, 0);
    const far = planPodFlight(-12, 0);
    expect(far.endAtMs).toBeGreaterThan(near.endAtMs);
    expect(far.cruiseY).toBeGreaterThan(near.cruiseY);
    // 100 tiles is a long trip (the old 3.2 s cap would have landed it long before).
    expect(planPodFlight(-100, 0).touchdownAtMs).toBeGreaterThan(14_000);
  });

  it("leans into the trip to accelerate and flares nose-up to brake before the hover", () => {
    const span = plan.descentAtMs - plan.cruiseAtMs;
    expect(podLeanAt(plan, plan.cruiseAtMs + span * 0.2)).toBeGreaterThan(0.1);
    expect(podLeanAt(plan, plan.cruiseAtMs + span * 0.92)).toBeLessThan(-0.05);
    // Upright while printing, lifting and coming straight down.
    expect(podLeanAt(plan, 100)).toBe(0);
    expect(podLeanAt(plan, plan.liftAtMs + 50)).toBe(0);
    expect(podLeanAt(plan, plan.descentAtMs + 50)).toBe(0);
    for (let t = plan.cruiseAtMs; t < plan.descentAtMs; t += 15) expect(Math.abs(podLeanAt(plan, t))).toBeLessThanOrEqual(0.6);
  });

  it("still hops (does not teleport) when the AFC is right next to the site", () => {
    const next = planPodFlight(-1, 0);
    const mid = at(next, (next.cruiseAtMs + next.descentAtMs) / 2);
    expect(mid.y).toBeGreaterThan(1);
  });

  it("never runs the flight backwards when the frame timestamp precedes the spawn time", () => {
    expect(at(plan, -10)).toEqual({ x: -6, y: POD_CHAMBER_Y, z: -4 });
    expect(podPrintedAt(plan, -10)).toBe(0);
  });

  it("only sets the crates down once it has landed", () => {
    expect(podCratesDelivered(plan, plan.descentAtMs)).toBe(false);
    expect(podCratesDelivered(plan, plan.touchdownAtMs)).toBe(false);
    expect(podCratesDelivered(plan, plan.touchdownAtMs + 100)).toBe(true);
  });
});
