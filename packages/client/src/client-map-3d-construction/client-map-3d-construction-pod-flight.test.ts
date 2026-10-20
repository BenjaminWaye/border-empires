import { describe, expect, it } from "vitest";
import {
  DRONE_AFC_HOVER_Y,
  DRONE_SITE_HOVER_Y,
  MAX_LEAN,
  MAX_SWING,
  POD_CHAMBER_Y,
  POD_MAX_Y,
  droneLeanAt,
  droneLineEndAt,
  dronePositionAt,
  droneScaleAt,
  droneStageAt,
  droneYawAt,
  planPodFlight,
  podCratesDelivered,
  podPositionAt,
  podPrintedAt,
  podStageAt,
  podSwingAt,
  type PodFlightPlan
} from "./client-map-3d-construction-pod-flight.js";

// Parts are fabricated at the owner's AFC and carried to the site by its courier drone; nothing
// drops from orbit.
const pod = (plan: PodFlightPlan, age: number) => podPositionAt(plan, age, { x: 0, y: 0, z: 0 });
const drone = (plan: PodFlightPlan, age: number) => dronePositionAt(plan, age, { x: 0, y: 0, z: 0 });
const ground = (p: { x: number; z: number }): number => Math.hypot(p.x, p.z);

describe("construction parts delivery by drone", () => {
  const plan = planPodFlight(-6, -4); // the AFC is 6 west, 4 north of the site
  const mid = (a: number, b: number): number => (a + b) / 2;

  it("prints the pod inside the AFC's glass chamber while the drone spools up on the crown and drops its line", () => {
    expect(podStageAt(plan, 0)).toBe("fabricate");
    expect(droneStageAt(plan, 0)).toBe("spool");
    expect(pod(plan, 0)).toEqual({ x: -6, y: POD_CHAMBER_Y, z: -4 });
    expect(podPrintedAt(plan, 0)).toBe(0);
    expect(podPrintedAt(plan, plan.hoistAtMs)).toBe(1);
    // The drone lifts off the crown into a hover over it, without going anywhere yet.
    expect(drone(plan, 0).y).toBeLessThan(drone(plan, plan.hoistAtMs).y);
    expect(drone(plan, plan.hoistAtMs)).toMatchObject({ x: -6, z: -4 });
    // The winch line reaches down into the chamber, to the top of the pod being printed.
    const end = { x: 0, y: 0, z: 0 };
    expect(droneLineEndAt(plan, plan.hoistAtMs - 1, end)).toBe(true);
    expect(end.y).toBeLessThan(0.6);
  });

  it("winches the pod up out of the crown until it hangs under the drone, then carries it", () => {
    const hung = pod(plan, plan.cruiseAtMs);
    const carrier = drone(plan, plan.cruiseAtMs);
    expect(hung.x).toBe(-6);
    expect(carrier.y).toBeCloseTo(DRONE_AFC_HOVER_Y, 5);
    expect(carrier.y - hung.y).toBeGreaterThan(0.2); // slung below, not stuck to the hull
    expect(carrier.y - hung.y).toBeLessThan(0.35);

    // Mid-trip the pod travels with the drone, still hanging beneath it.
    const t = mid(plan.cruiseAtMs, plan.lowerAtMs);
    expect(Math.abs(pod(plan, t).x - drone(plan, t).x)).toBeLessThan(0.15);
    expect(drone(plan, t).y - pod(plan, t).y).toBeGreaterThan(0.2);
    expect(Math.abs(drone(plan, t).x)).toBeGreaterThan(0);
    expect(Math.abs(drone(plan, t).x)).toBeLessThan(6);
  });

  it("holds a hover over the stack and winches the pod straight down onto it", () => {
    expect(ground(drone(plan, plan.lowerAtMs))).toBeLessThan(1e-6);
    expect(drone(plan, plan.lowerAtMs).y).toBeCloseTo(DRONE_SITE_HOVER_Y, 1);
    const halfway = pod(plan, mid(plan.lowerAtMs, plan.touchdownAtMs));
    expect(ground(halfway)).toBeLessThan(0.05);
    expect(halfway.y).toBeLessThan(pod(plan, plan.lowerAtMs).y);
    expect(halfway.y).toBeGreaterThan(0.1);
    // The drone stays put while the pod comes down.
    expect(ground(drone(plan, mid(plan.lowerAtMs, plan.touchdownAtMs)))).toBeLessThan(1e-6);
    expect(pod(plan, plan.touchdownAtMs)).toEqual({ x: 0, y: 0, z: 0 });
    expect(podStageAt(plan, plan.touchdownAtMs)).toBe("unpack");
  });

  it("lets go, turns for home, flies back and docks in the AFC's crown", () => {
    const end = { x: 0, y: 0, z: 0 };
    expect(droneLineEndAt(plan, plan.returnAtMs, end)).toBe(false); // the line is reeled in
    expect(droneYawAt(plan, plan.lowerAtMs)).toBeCloseTo(plan.heading, 5);
    expect(droneYawAt(plan, plan.returnAtMs + 600)).toBeCloseTo(plan.heading + Math.PI, 5);
    expect(droneStageAt(plan, mid(plan.returnAtMs, plan.dockAtMs))).toBe("return");
    expect(drone(plan, plan.dockAtMs)).toMatchObject({ x: -6, z: -4 });
    expect(droneScaleAt(plan, plan.dockAtMs)).toBe(1);
    expect(droneScaleAt(plan, plan.droneGoneAtMs)).toBe(0);
    expect(droneStageAt(plan, plan.droneGoneAtMs)).toBe("done");
    expect(plan.endAtMs).toBeGreaterThanOrEqual(plan.droneGoneAtMs);
  });

  it("flies like a quadcopter: tips into the trip, tips back to brake, both ways", () => {
    const out = plan.lowerAtMs - plan.cruiseAtMs;
    expect(droneLeanAt(plan, plan.cruiseAtMs + out * 0.2)).toBeGreaterThan(0.1);
    expect(droneLeanAt(plan, plan.cruiseAtMs + out * 0.92)).toBeLessThan(-0.05);
    const back = plan.dockAtMs - plan.returnAtMs;
    expect(droneLeanAt(plan, plan.returnAtMs + back * 0.2)).toBeGreaterThan(0.1); // nose toward home now
    // Level on station.
    expect(droneLeanAt(plan, 100)).toBe(0);
    expect(droneLeanAt(plan, mid(plan.lowerAtMs, plan.touchdownAtMs))).toBe(0);
    for (let t = 0; t < plan.endAtMs; t += 15) expect(Math.abs(droneLeanAt(plan, t))).toBeLessThanOrEqual(MAX_LEAN);
  });

  it("swings the slung pod back as the drone speeds up and lets it settle before it is lowered", () => {
    const out = plan.lowerAtMs - plan.cruiseAtMs;
    expect(podSwingAt(plan, plan.cruiseAtMs + out * 0.25)).toBeGreaterThan(0.05); // trailing behind
    expect(podSwingAt(plan, plan.cruiseAtMs + out * 0.97)).toBeLessThan(-0.02); // thrown forward by the braking
    expect(Math.abs(podSwingAt(plan, plan.touchdownAtMs - 5))).toBeLessThan(0.01);
    for (let t = 0; t < plan.endAtMs; t += 15) expect(Math.abs(podSwingAt(plan, t))).toBeLessThanOrEqual(MAX_SWING);
  });

  it("never comes from orbit: a low hop well below the old 3-tile drop", () => {
    for (const distance of [1, 4, 12, 60]) {
      const far = planPodFlight(-distance, 0);
      let highest = 0;
      for (let t = 0; t < far.endAtMs; t += 20) highest = Math.max(highest, drone(far, t).y, pod(far, t).y);
      expect(highest).toBeLessThanOrEqual(POD_MAX_Y + 1e-9);
      expect(highest).toBeLessThan(2.6);
    }
  });

  it("flies farther sites for longer and higher, with no cap on the trip time", () => {
    const near = planPodFlight(-2, 0);
    const far = planPodFlight(-12, 0);
    expect(far.touchdownAtMs).toBeGreaterThan(near.touchdownAtMs);
    expect(far.cruiseY).toBeGreaterThan(near.cruiseY);
    expect(planPodFlight(-100, 0).touchdownAtMs).toBeGreaterThan(14_000);
  });

  it("still clears the ground when the AFC is right next to the site", () => {
    const next = planPodFlight(-1, 0);
    for (let t = 0; t < next.touchdownAtMs; t += 20) expect(pod(next, t).y).toBeGreaterThanOrEqual(0);
    expect(pod(next, mid(next.cruiseAtMs, next.lowerAtMs)).y).toBeGreaterThan(0.8);
  });

  it("never runs backwards when the frame timestamp precedes the spawn time", () => {
    expect(pod(plan, -10)).toEqual({ x: -6, y: POD_CHAMBER_Y, z: -4 });
    expect(podPrintedAt(plan, -10)).toBe(0);
  });

  it("only sets the crates down once the pod has landed", () => {
    expect(podCratesDelivered(plan, plan.lowerAtMs)).toBe(false);
    expect(podCratesDelivered(plan, plan.touchdownAtMs)).toBe(false);
    expect(podCratesDelivered(plan, plan.touchdownAtMs + 100)).toBe(true);
  });
});
