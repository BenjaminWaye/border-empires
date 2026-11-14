import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { planScoutDroneFlight, type ScoutDroneFlight } from "@border-empires/shared";
import { createScoutDroneOverlay, syncScoutDroneOverlayFrame, type ScoutDroneOverlay, type ScoutDroneSceneFrame } from "./client-map-3d-scout-drone-overlay.js";
import { scoutDroneRoute2D } from "../client-map-render-2d-scout-drone/client-map-render-2d-scout-drone.js";

const world = { width: 100, height: 60 };
// Launch from (3, 5) toward (9, 5): home land x < 4, open beyond.
const flight = planScoutDroneFlight({ x: 3, y: 5 }, { x: 9, y: 5 }, 0, {
  ...world,
  classify: (x) => (x < 4 ? { kind: "HOME" } : { kind: "OPEN" })
}) as ScoutDroneFlight;
const sceneFor = (x: number, y: number) => ({ sceneX: x, sceneZ: y, surfaceY: 0 });

const recorder = (): ScoutDroneOverlay & { frames: Array<ScoutDroneSceneFrame | undefined> } => {
  const frames: Array<ScoutDroneSceneFrame | undefined> = [];
  return { frames, set: (frame) => frames.push(frame), dispose: () => undefined };
};

describe("syncScoutDroneOverlayFrame", () => {
  it("places the drone mid-flight with the route ahead ending at the turnaround tile", () => {
    const overlay = recorder();
    const t = (flight.steps[2]!.at + flight.steps[3]!.at) / 2;
    syncScoutDroneOverlayFrame(overlay, flight, t, world, sceneFor);
    const frame = overlay.frames[0]!;
    expect(frame.drone.sceneX).toBeCloseTo(5.5);
    expect(frame.dirX).toBeCloseTo(1);
    expect(frame.path.at(-1)).toMatchObject({ sceneX: 9, sceneZ: 5 });
  });

  it("points the route home once the drone has turned", () => {
    const overlay = recorder();
    syncScoutDroneOverlayFrame(overlay, flight, flight.steps[flight.turnIndex + 1]!.at + 1, world, sceneFor);
    const frame = overlay.frames[0]!;
    expect(frame.dirX).toBeCloseTo(-1);
    expect(frame.path.at(-1)).toMatchObject({ sceneX: 3, sceneZ: 5 });
  });

  it("hides the drone once it has landed, or when there is no flight", () => {
    const overlay = recorder();
    syncScoutDroneOverlayFrame(overlay, flight, flight.landsAt, world, sceneFor);
    syncScoutDroneOverlayFrame(overlay, undefined, 0, world, sceneFor);
    expect(overlay.frames).toEqual([undefined, undefined]);
  });

  it("builds and tears down its meshes in a scene", () => {
    const scene = new Scene();
    const overlay = createScoutDroneOverlay(scene);
    syncScoutDroneOverlayFrame(overlay, flight, flight.steps[2]!.at, world, sceneFor);
    const group = scene.getObjectByName("scout-drone-overlay")!;
    expect(group.visible).toBe(true);
    expect(group.getObjectByName("scout-drone")).toBeDefined();
    syncScoutDroneOverlayFrame(overlay, flight, flight.landsAt + 1, world, sceneFor);
    expect(group.visible).toBe(false);
    overlay.dispose();
    expect(scene.getObjectByName("scout-drone-overlay")).toBeUndefined();
  });
});

describe("scoutDroneRoute2D", () => {
  it("projects the drone and the route ahead to screen space", () => {
    const view = scoutDroneRoute2D(flight, flight.steps[1]!.at, world, (x, y) => ({ sx: x * 10, sy: y * 10 }))!;
    expect(view.drone).toEqual({ sx: 40, sy: 50 });
    expect(view.route.at(-1)).toEqual({ sx: 90, sy: 50 });
    expect(scoutDroneRoute2D(flight, flight.landsAt, world, (x, y) => ({ sx: x, sy: y }))).toBeUndefined();
  });
});
