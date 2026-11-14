import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { planScoutDroneFlight, type ScoutDroneFlight } from "@border-empires/shared";
import {
  SCOUT_DRONE_CRUISE_HEIGHT,
  SCOUT_DRONE_DOCK_HEIGHT,
  createScoutDroneOverlay,
  type ScoutDroneScenePoint
} from "./client-map-3d-scout-drone-overlay.js";
import { SCOUT_LAUNCH_MS, createScoutDronePose, scoutDronePoseAt } from "./client-map-3d-scout-drone-pose.js";
import { drawScoutDrone2D } from "../client-map-render-2d-scout-drone/client-map-render-2d-scout-drone.js";
import type { UnitMotionGate } from "../client-map-3d-unit-motion-gate/client-map-3d-unit-motion-gate.js";

const world = { width: 100, height: 60 };
// Launch from the AFC at (3, 5) toward (9, 5): home land x < 4, open beyond.
const flight = planScoutDroneFlight({ x: 3, y: 5 }, { x: 9, y: 5 }, 0, {
  ...world,
  classify: (x) => (x < 4 ? { kind: "HOME" } : { kind: "OPEN" })
}) as ScoutDroneFlight;
const sceneFor = (x: number, y: number, out: ScoutDroneScenePoint): void => {
  out.sceneX = x;
  out.sceneZ = y;
  out.surfaceY = 0;
};
const midFlight = (flight.steps[2]!.at + flight.steps[3]!.at) / 2;
const gate = (animate: boolean): UnitMotionGate => ({ recordFrame: () => undefined, shouldAnimate: () => animate });

describe("scoutDronePoseAt", () => {
  const pose = createScoutDronePose();

  it("starts docked on the AFC with its rotors stopped", () => {
    expect(scoutDronePoseAt(flight, flight.launchedAt, world.width, world.height, pose)).toBe(true);
    expect(pose).toMatchObject({ x: 3, y: 5, lift: 0, rotor: 0, returning: false });
  });

  it("cruises along the route once launched, heading east at Expand To pace", () => {
    scoutDronePoseAt(flight, midFlight, world.width, world.height, pose);
    expect(pose.x).toBeCloseTo(5.5);
    expect(pose.lift).toBe(1);
    expect(pose.rotor).toBe(1);
    expect(pose.dirX).toBeCloseTo(1);
    expect(pose.speed).toBeCloseTo(1000 / 7500);
  });

  it("is half way up during the launch, and turns for home after the turnaround", () => {
    scoutDronePoseAt(flight, flight.launchedAt + SCOUT_LAUNCH_MS / 2, world.width, world.height, pose);
    expect(pose.lift).toBeCloseTo(0.5);
    scoutDronePoseAt(flight, flight.steps[flight.turnIndex + 1]!.at + 1, world.width, world.height, pose);
    expect(pose.returning).toBe(true);
    expect(pose.dirX).toBeCloseTo(-1);
  });

  it("has nothing to draw once landed or without a flight", () => {
    expect(scoutDronePoseAt(flight, flight.landsAt, world.width, world.height, pose)).toBe(false);
    expect(scoutDronePoseAt(undefined, 0, world.width, world.height, pose)).toBe(false);
  });
});

describe("createScoutDroneOverlay", () => {
  it("rises from the AFC crown to cruise height and hides once landed", () => {
    const scene = new Scene();
    const overlay = createScoutDroneOverlay(scene, { world, sceneFor, motionGate: gate(true) });
    const drone = scene.getObjectByName("scout-drone")!;
    overlay.sync(flight, flight.launchedAt);
    expect(drone.visible).toBe(true);
    expect(drone.position.y).toBeCloseTo(SCOUT_DRONE_DOCK_HEIGHT);
    overlay.sync(flight, midFlight);
    expect(drone.position.x).toBeCloseTo(5.5);
    expect(drone.position.y).toBeGreaterThan(SCOUT_DRONE_CRUISE_HEIGHT - 0.1);
    expect(scene.getObjectByName("scout-drone-ground-fx")!.visible).toBe(true);
    overlay.sync(flight, flight.landsAt);
    expect(drone.visible).toBe(false);
    expect(scene.getObjectByName("scout-drone-ground-fx")!.visible).toBe(false);
  });

  it("holds the decorative motion still when the motion gate says so", () => {
    const scene = new Scene();
    const overlay = createScoutDroneOverlay(scene, { world, sceneFor, motionGate: gate(false) });
    overlay.sync(flight, midFlight);
    overlay.sync(flight, midFlight + 500);
    expect(scene.getObjectByName("scout-drone-trails")!.visible).toBe(false);
    overlay.dispose();
  });

  it("removes everything it added on dispose", () => {
    const scene = new Scene();
    const overlay = createScoutDroneOverlay(scene, { world, sceneFor, motionGate: gate(true) });
    overlay.sync(flight, midFlight);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe("drawScoutDrone2D", () => {
  // A canvas context stand-in that records which drawing calls were made.
  const recordingContext = () => {
    const calls: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key) => (key in target ? target[key as string] : (...args: unknown[]) => calls.push(`${String(key)}:${args.length}`)),
      set: (target, key, value) => {
        target[key as string] = value;
        return true;
      }
    });
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  };
  const toScreen = (x: number, y: number) => ({ sx: x * 10, sy: y * 10 });

  it("draws the footprint, route and craft while the drone is out", () => {
    const { ctx, calls } = recordingContext();
    drawScoutDrone2D(ctx, flight, midFlight, world, toScreen, 10);
    expect(calls.some((c) => c.startsWith("ellipse"))).toBe(true);
    expect(calls.filter((c) => c.startsWith("arc")).length).toBeGreaterThan(10);
    expect(calls.filter((c) => c.startsWith("closePath")).length).toBeGreaterThan(8); // faceted hull and octagonal ducts
  });

  it("draws nothing once the drone has landed", () => {
    const { ctx, calls } = recordingContext();
    drawScoutDrone2D(ctx, flight, flight.landsAt, world, toScreen, 10);
    expect(calls).toHaveLength(0);
  });
});
