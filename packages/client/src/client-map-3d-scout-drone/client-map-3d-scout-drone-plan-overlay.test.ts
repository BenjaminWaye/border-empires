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

  // Player reviews 2026-11-21: orange with a trail read as an error, and a ring under a number bled through it.
  // Stops are numbered discs; only a pulled-back stop adds a ring, its limit ring.
  it("draws one limit ring for a pulled-back stop and none under numbered stops", () => {
    const scene = new Scene();
    const overlay = createScoutPlanOverlay(scene, { state: planned(), sceneFor });
    overlay.sync(1_000);
    const rings = scene.getObjectByName("scout-drone-plan")!.children[1] as InstancedMesh;
    expect(rings.count).toBe(1);
    overlay.dispose();
  });

  // Player review 2026-11-21: the bright marker alone read as one more stop.
  it("puts the drone's own badge over it while it flies, and takes it away once it lands", () => {
    const state = createInitialState();
    state.scoutDroneFlight = { launchedAt: 0, landsAt: 9_000, targetX: 13, targetY: 10, turnIndex: 3, endReason: "TARGET", steps: [10, 11, 12, 13, 12, 11, 10].map((x, i) => ({ x, y: 10, at: i * 1_500 })) };
    const scene = new Scene();
    const overlay = createScoutPlanOverlay(scene, { state, sceneFor });
    overlay.sync(2_000);
    expect(scene.getObjectByName("scout-drone-badge")!.visible).toBe(true);
    overlay.sync(9_500);
    expect(scene.getObjectByName("scout-drone-badge")!.visible).toBe(false);
    overlay.dispose();
    expect(scene.getObjectByName("scout-drone-badge")).toBeUndefined();
  });

  // Review 2026-11-21: a route crossing a later stop's tile on an earlier leg hid that stop too soon.
  it("keeps a later stop numbered when an earlier leg crosses its tile", () => {
    const state = createInitialState();
    // Out 10 -> 14 (stop 1 at 14), back to 12 (stop 2 at 12), home. Tile 12 is crossed on leg 1 first.
    const xs = [10, 11, 12, 13, 14, 13, 12, 11, 10];
    state.scoutDroneFlight = { launchedAt: 0, landsAt: 12_000, targetX: 12, targetY: 10, turnIndex: 6, endReason: "TARGET", waypoints: [{ x: 14, y: 10 }, { x: 12, y: 10 }], steps: xs.map((x, i) => ({ x, y: 10, at: i * 1_500 })) };
    const scene = new Scene();
    const overlay = createScoutPlanOverlay(scene, { state, sceneFor });
    overlay.sync(4_000); // past tile 12 on the way out, before stop 1
    const numbers = scene.getObjectByName("scout-drone-stop-numbers")!;
    expect(numbers.children.filter((sprite) => sprite.visible)).toHaveLength(2);
    overlay.dispose();
  });

  it("pops what the drone spots over the map, then retires the sprite", () => {
    const state = createInitialState();
    state.scoutFindPops = [{ id: 1, x: 12, y: 10, text: "+1 Town", at: 1_000 }];
    const scene = new Scene();
    const overlay = createScoutPlanOverlay(scene, { state, sceneFor });
    overlay.sync(1_500);
    expect(scene.getObjectByName("scout-drone-find-pop")).toBeDefined();
    overlay.sync(1_000 + 60_000);
    expect(scene.getObjectByName("scout-drone-find-pop")).toBeUndefined();
    overlay.dispose();
  });

  // Player review round 9: the ring on a framed find hid under a town's name label; a pin stands above it.
  it("stands a pin over a find framed from the report card while the card is up", () => {
    const state = createInitialState();
    state.scoutFindFocus = { x: 12, y: 10 };
    state.scoutDroneReport = { targetX: 12, targetY: 10, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [], at: 0 };
    const scene = new Scene();
    const overlay = createScoutPlanOverlay(scene, { state, sceneFor });
    overlay.sync(5_000);
    expect(scene.getObjectByName("scout-drone-find-pin")!.visible).toBe(true);
    // Review 2026-11-21: the pin outlived the card's 90 s timeout.
    overlay.sync(91_000);
    expect(scene.getObjectByName("scout-drone-find-pin")!.visible).toBe(false);
    overlay.dispose();
  });
});
