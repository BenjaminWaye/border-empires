import { describe, expect, it } from "vitest";
import { Scene, type BufferGeometry, type Mesh, type MeshBasicMaterial } from "three";
import { planScoutDroneFlight, type ScoutDroneFlight } from "@border-empires/shared";
import {
  SCOUT_DRONE_CRUISE_HEIGHT,
  SCOUT_DRONE_DOCK_HEIGHT,
  createScoutDroneOverlay,
  type ScoutDroneScenePoint
} from "./client-map-3d-scout-drone-overlay.js";
import { SCOUT_LAND_MS, SCOUT_LAUNCH_MS, SCOUT_SPOOL_MS, createScoutDronePose, scoutDronePoseAt } from "./client-map-3d-scout-drone-pose.js";
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

  it("spools its props up on the crown before it lifts", () => {
    scoutDronePoseAt(flight, flight.launchedAt + SCOUT_SPOOL_MS * 0.25, world.width, world.height, pose);
    const early = pose.rotor;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(0.5);
    expect(pose.lift).toBe(0);
    scoutDronePoseAt(flight, flight.launchedAt + SCOUT_SPOOL_MS * 0.75, world.width, world.height, pose);
    expect(pose.rotor).toBeGreaterThan(early * 2);
    expect(pose.lift).toBe(0);
    scoutDronePoseAt(flight, flight.launchedAt + SCOUT_SPOOL_MS, world.width, world.height, pose);
    expect(pose.rotor).toBe(1);
    expect(pose.lift).toBe(0);
  });

  it("is half way up during the climb, and turns for home after the turnaround", () => {
    scoutDronePoseAt(flight, flight.launchedAt + (SCOUT_SPOOL_MS + SCOUT_LAUNCH_MS) / 2, world.width, world.height, pose);
    expect(pose.lift).toBeCloseTo(0.5);
    expect(pose.launchT).toBeCloseTo(0.5);
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

  it("casts its silhouette shadow, turned with its heading, crisp on the crown and soft at altitude", () => {
    const scene = new Scene();
    const overlay = createScoutDroneOverlay(scene, { world, sceneFor, motionGate: gate(true) });
    const shadow = scene.getObjectByName("scout-drone-shadow")!;
    const opacities = (): [number, number] => {
      const [sharp, soft] = shadow.children as Mesh<BufferGeometry, MeshBasicMaterial>[];
      return [sharp!.material.opacity, soft!.material.opacity];
    };
    overlay.sync(flight, flight.launchedAt);
    const [sharpLow, softLow] = opacities();
    expect(sharpLow).toBeGreaterThan(softLow);
    overlay.sync(flight, midFlight);
    const [sharpHigh, softHigh] = opacities();
    expect(softHigh).toBeGreaterThan(sharpHigh);
    expect(sharpHigh + softHigh).toBeLessThan(sharpLow + softLow); // fainter with altitude
    expect(shadow.rotation.y).toBeCloseTo(scene.getObjectByName("scout-drone")!.rotation.y);
    overlay.dispose();
  });

  it("leans forward before moving off and flares nose-up before landing", () => {
    const scene = new Scene();
    const overlay = createScoutDroneOverlay(scene, { world, sceneFor, motionGate: gate(true) });
    const drone = scene.getObjectByName("scout-drone")!;
    overlay.sync(flight, flight.launchedAt + SCOUT_SPOOL_MS + (SCOUT_LAUNCH_MS - SCOUT_SPOOL_MS) * 0.47);
    expect(drone.rotation.x).toBeGreaterThan(0.1); // nose down
    overlay.sync(flight, flight.landsAt - SCOUT_LAND_MS * 0.6);
    expect(drone.rotation.x).toBeLessThan(-0.08); // nose up
    overlay.dispose();
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
    expect(calls.filter((c) => c.startsWith("ellipse")).length).toBeGreaterThanOrEqual(8); // the four pods, rim and top
    expect(calls.filter((c) => c.startsWith("arc:")).length).toBeGreaterThanOrEqual(12); // rotor discs, sphere, eye, footprint
  });

  it("draws nothing once the drone has landed", () => {
    const { ctx, calls } = recordingContext();
    drawScoutDrone2D(ctx, flight, flight.landsAt, world, toScreen, 10);
    expect(calls).toHaveLength(0);
  });
});
