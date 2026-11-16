import { describe, expect, it } from "vitest";
import { Scene, type Sprite } from "three";
import { planScoutDroneFlight, type ScoutDroneFlight } from "@border-empires/shared";
import {
  SCOUT_DARK_SENSOR_LEVEL,
  SCOUT_HOME_RECHECK_MS,
  SCOUT_LIGHTS_FADE_MS,
  createScoutRunningLights,
  isScoutHomeTile,
  scoutSensorLevel,
  updateScoutRunningLights,
  type ScoutHomeSource
} from "./client-map-3d-scout-drone-running-lights.js";
import { createScoutDroneOverlay, type ScoutDroneScenePoint } from "./client-map-3d-scout-drone-overlay.js";
import { drawScoutDrone2D } from "../client-map-render-2d-scout-drone/client-map-render-2d-scout-drone.js";
import { drawScoutCraft2D } from "../client-map-render-2d-scout-drone/client-map-render-2d-scout-drone-craft.js";

const world = { width: 100, height: 60 };
// The player owns x <= 4 on row 5, an ally owns (5, 5); everything else is unknown.
const tiles = new Map<string, { ownerId?: string }>();
for (let x = 0; x <= 4; x += 1) tiles.set(`${x},5`, { ownerId: "me" });
tiles.set("5,5", { ownerId: "friend" });
tiles.set("7,5", { ownerId: "rival" });
const source: ScoutHomeSource = { me: "me", allies: ["friend"], tiles };

describe("isScoutHomeTile", () => {
  it("counts the player's own and allied land as home, and nothing else", () => {
    expect(isScoutHomeTile(source, 3, 5)).toBe(true);
    expect(isScoutHomeTile(source, 5, 5)).toBe(true);
    expect(isScoutHomeTile(source, 7, 5)).toBe(false);
    expect(isScoutHomeTile(source, 6, 5)).toBe(false); // not known to the client
  });
});

describe("updateScoutRunningLights", () => {
  it("starts lit over home, fades dark over SCOUT_LIGHTS_FADE_MS past the border, and lights up again on the way home", () => {
    const lights = createScoutRunningLights();
    expect(updateScoutRunningLights(lights, 3.2, 5, world, 0, source)).toBe(1);
    // Crossing onto ground the client doesn't know: dark after SCOUT_LIGHTS_FADE_MS, half way at half time.
    expect(updateScoutRunningLights(lights, 6, 5, world, 1_000, source)).toBe(0); // a long frame gap finishes the fade at once
    const cross = createScoutRunningLights();
    updateScoutRunningLights(cross, 4, 5, world, 0, source);
    expect(updateScoutRunningLights(cross, 6, 5, world, 0, source)).toBe(1);
    expect(updateScoutRunningLights(cross, 6.1, 5, world, SCOUT_LIGHTS_FADE_MS / 2, source)).toBeCloseTo(0.5);
    expect(updateScoutRunningLights(cross, 6.2, 5, world, SCOUT_LIGHTS_FADE_MS, source)).toBe(0);
    expect(updateScoutRunningLights(cross, 6.3, 5, world, 2_000, source)).toBe(0);
    // Back over allied land: the lights fade back in.
    expect(updateScoutRunningLights(cross, 5, 5, world, 2_000, source)).toBe(0);
    expect(updateScoutRunningLights(cross, 5, 5, world, 2_000 + SCOUT_LIGHTS_FADE_MS / 2, source)).toBeCloseTo(0.5);
    expect(updateScoutRunningLights(cross, 4.6, 5, world, 2_000 + SCOUT_LIGHTS_FADE_MS, source)).toBe(1);
  });

  it("starts dark when it first appears past the border", () => {
    expect(updateScoutRunningLights(createScoutRunningLights(), 20, 30, world, 0, source)).toBe(0);
  });

  it("notices ownership changing under a hovering drone at the recheck interval", () => {
    const owned = new Map<string, { ownerId?: string }>([["9,9", { ownerId: "me" }]]);
    const changing: ScoutHomeSource = { me: "me", allies: [], tiles: owned };
    const lights = createScoutRunningLights();
    updateScoutRunningLights(lights, 9, 9, world, 0, changing);
    owned.set("9,9", { ownerId: "rival" });
    expect(lights.home).toBe(true);
    updateScoutRunningLights(lights, 9, 9, world, SCOUT_HOME_RECHECK_MS, changing);
    expect(lights.home).toBe(false);
  });

  it("keeps the lights on without tile data", () => {
    expect(updateScoutRunningLights(createScoutRunningLights(), 50, 50, world, 0, undefined)).toBe(1);
  });

  it("never lets the sensor glow go out", () => {
    expect(scoutSensorLevel(1)).toBe(1);
    expect(scoutSensorLevel(0)).toBe(SCOUT_DARK_SENSOR_LEVEL);
  });
});

// A flight from (2, 5) straight east, past the border at x = 5.
const flight = planScoutDroneFlight({ x: 2, y: 5 }, { x: 14, y: 5 }, 0, {
  ...world,
  classify: (x) => (x <= 4 ? { kind: "HOME" } : { kind: "OPEN" })
}) as ScoutDroneFlight;
const overHome = flight.steps[2]!.at; // x = 4
const pastBorder = flight.steps[6]!.at; // x = 8

describe("running dark in both renderers", () => {
  it("3D: hides the nav lights, strobe and trails past the border and keeps the eye dim", () => {
    const scene = new Scene();
    const sceneFor = (x: number, y: number, out: ScoutDroneScenePoint): void => {
      out.sceneX = x;
      out.sceneZ = y;
      out.surfaceY = 0;
    };
    const overlay = createScoutDroneOverlay(scene, { world, sceneFor, homeSource: source, motionGate: { recordFrame: () => undefined, shouldAnimate: () => true } });
    const glows = (): Sprite[] => {
      const found: Sprite[] = [];
      scene.getObjectByName("scout-drone")!.traverse((object) => {
        if ((object as Sprite).isSprite) found.push(object as Sprite);
      });
      return found;
    };
    overlay.sync(flight, overHome);
    // Over home land the steady lights are on (the strobe only shows during its flashes).
    expect(glows().filter((glow) => glow.visible).length).toBeGreaterThanOrEqual(4);
    overlay.sync(flight, pastBorder);
    overlay.sync(flight, pastBorder + SCOUT_LIGHTS_FADE_MS + 50);
    const visible = glows().filter((glow) => glow.visible);
    expect(visible).toHaveLength(1); // the eye, dimmed
    expect(scene.getObjectByName("scout-drone-trails")!.visible).toBe(false);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("2D: drops the nav lights past the border", () => {
    const shadowColors = (nowMs: number): string[] => {
      const colors: string[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (target, key) => (key in target ? target[key as string] : () => undefined),
        set: (target, key, value) => {
          if (key === "shadowColor") colors.push(String(value));
          target[key as string] = value;
          return true;
        }
      }) as unknown as CanvasRenderingContext2D;
      drawScoutDrone2D(ctx, flight, nowMs, world, (x, y) => ({ sx: x * 10, sy: y * 10 }), 10, source);
      return colors;
    };
    expect(shadowColors(overHome)).toContain("#ff3b26");
    shadowColors(pastBorder);
    expect(shadowColors(pastBorder + SCOUT_LIGHTS_FADE_MS + 50)).not.toContain("#ff3b26");
  });

  // Parity with the 3D double-flash strobe on the rear-left pod.
  it("2D: flashes the white strobe while lit, and never when running dark", () => {
    const strobeShown = (lights: number, strobe: boolean): boolean => {
      const colors: string[] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (target, key) => (key in target ? target[key as string] : () => undefined),
        set: (target, key, value) => {
          if (key === "shadowColor") colors.push(String(value));
          target[key as string] = value;
          return true;
        }
      }) as unknown as CanvasRenderingContext2D;
      drawScoutCraft2D(ctx, 20, 0, 0, lights, 1, 0, strobe);
      return colors.includes("#ffffff");
    };
    expect(strobeShown(1, true)).toBe(true);
    expect(strobeShown(1, false)).toBe(false);
    expect(strobeShown(0, true)).toBe(false);
  });
});
