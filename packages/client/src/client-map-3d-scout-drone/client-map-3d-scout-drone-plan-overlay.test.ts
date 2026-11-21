import { describe, expect, it } from "vitest";
import type { ScoutDroneFlight } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { type InstancedMesh, Scene } from "three";
import type { Tile } from "../client-types.js";
import { createScoutPlanOverlay, scoutPlanRouteKey } from "./client-map-3d-scout-drone-plan-overlay.js";

describe("scoutPlanRouteKey", () => {
  // Review 2026-11-21: with the map unchanged, the route stayed drawn from where the drone used to be.
  it("changes as the flying drone moves on and once it lands, with the plan and map unchanged", () => {
    const state = createInitialState();
    state.scoutDronePicking = { active: true, stops: [{ x: 9, y: 9 }], bumpAt: 0, shakeAt: 0, launches: 0 };
    const flight: ScoutDroneFlight = { launchedAt: 0, landsAt: 3_000, targetX: 2, targetY: 0, turnIndex: 2, endReason: "TARGET", steps: [{ x: 0, y: 0, at: 0 }, { x: 1, y: 0, at: 1_000 }, { x: 2, y: 0, at: 2_000 }, { x: 1, y: 0, at: 3_000 }] };
    state.scoutDroneFlight = flight;
    const early = scoutPlanRouteKey(state, 500);
    const later = scoutPlanRouteKey(state, 2_500);
    const landed = scoutPlanRouteKey(state, 3_500);
    expect(new Set([early, later, landed]).size).toBe(3);
    expect(scoutPlanRouteKey(state, 600)).toBe(early);
  });
});

describe("createScoutPlanOverlay", () => {
  const planned = () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile);
    // The second stop is far past a leg's range, so it is pulled back.
    state.scoutDronePicking = { active: true, stops: [{ x: 14, y: 10 }, { x: 60, y: 10 }], bumpAt: 0, shakeAt: 0, launches: 0 };
    return state;
  };
  const sceneFor = (x: number, y: number, out: { sceneX: number; sceneZ: number; surfaceY: number }): void => {
    out.sceneX = x;
    out.sceneZ = y;
    out.surfaceY = 0;
  };

  // Player review 2026-11-21: the route's order was unreadable once it crossed itself.
  it("numbers the planned stops in order", () => {
    const scene = new Scene();
    const overlay = createScoutPlanOverlay(scene, { state: planned(), sceneFor });
    overlay.sync(1_000);
    const numbers = scene.getObjectByName("scout-drone-stop-numbers")!;
    expect(numbers.children.filter((sprite) => sprite.visible)).toHaveLength(2);
    overlay.dispose();
  });

  // Player reviews 2026-11-21: orange with a trail read as an error; a pulled-back stop is a normal ring plus a limit ring.
  it("draws a pulled-back stop as a normal ring with one extra limit ring", () => {
    const scene = new Scene();
    const overlay = createScoutPlanOverlay(scene, { state: planned(), sceneFor });
    overlay.sync(1_000);
    const rings = scene.getObjectByName("scout-drone-plan")!.children[1] as InstancedMesh;
    expect(rings.count).toBe(3);
    overlay.dispose();
  });
});
