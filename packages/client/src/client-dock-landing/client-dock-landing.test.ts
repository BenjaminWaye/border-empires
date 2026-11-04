import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { WORLD_WIDTH } from "@border-empires/shared";
import { dockLandingFor, landingCarrierPose, landingMarinePose, SAIL_MS, RAMP_MS, UNLOAD_MS, sailMsForRoute } from "./client-dock-landing.js";
import { createDockCarrierOverlay } from "./client-dock-carrier-3d.js";
import { type MarinePose } from "../client-map-3d-popup-marine/popup-marine-timeline.js";
import type { BattleOverlaySkirmishEntry } from "./client-battle-render-types.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const START = 100;
const sea = (x: number, y: number): Tile => ({ x, y, terrain: "SEA" });
const state: Pick<ClientState, "dockPairs" | "tiles"> = {
  dockPairs: [{ ax: 1, ay: 1, bx: 5, by: 1, route: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }] }],
  tiles: new Map([["2,1", sea(2, 1)], ["3,1", sea(3, 1)], ["4,1", sea(4, 1)], ["5,1", { x: 5, y: 1, terrain: "LAND" }]])
};
const landing = () => dockLandingFor(state, 1, 1, 5, 1, START)!;
const base: MarinePose = { localX: -0.1, localZ: 0.2, stance: "stand", yaw: 0, scale: 1, crouchT: 0, fallT: 0, flash: 1 };
const battle = (): BattleOverlaySkirmishEntry => ({
  srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "#0088ff", defenderColor: "#ff0000", startAt: START, hashSeed: 5, landing: landing()
});

describe("dock assault landing", () => {
  it("uses linked dock crossings and excludes adjacent overland and unlinked attacks", () => {
    expect(landing().inwardX).toBe(1);
    expect(dockLandingFor(state, 4, 1, 5, 1, START)).toBeUndefined();
    expect(dockLandingFor({ ...state, dockPairs: [] }, 1, 1, 5, 1, START)).toBeUndefined();
  });
  it("sails before opening the ramp, then holds exactly at the beach throughout combat", () => {
    const l = landing();
    expect(landingCarrierPose(l, START).x).toBe(-3);
    expect(landingCarrierPose(l, START + l.sailMs / 2).x).toBeLessThan(-0.72);
    expect(landingCarrierPose(l, START + l.sailMs).rampOpen).toBe(0);
    expect(landingCarrierPose(l, START + l.sailMs + RAMP_MS).rampOpen).toBe(1);
    const beached = landingCarrierPose(l, START + l.approachMs);
    expect(landingCarrierPose(l, START + 60_000)).toEqual(beached);
    expect(beached.x).toBeCloseTo(-0.72);
  });
  it("keeps infantry aboard until the ramp is down and staggers their exit into two files", () => {
    const l = landing();
    expect(landingMarinePose(base, l, 0, START + l.sailMs).scale).toBe(0);
    const now = START + l.sailMs + RAMP_MS + 50;
    const left = landingMarinePose(base, l, 0, now);
    const right = landingMarinePose(base, l, 1, now);
    expect(left.scale).toBe(1); expect(left.stance).toBe("run"); expect(left.flash).toBe(0);
    expect(left.localX).toBeLessThan(-0.46);
    expect(left.localZ).not.toBe(right.localZ);
    expect(landingMarinePose(base, l, 0, START + l.sailMs + 800).localZ).toBeCloseTo(-0.505);
    expect(landingMarinePose(base, l, 6, now).scale).toBe(0);
    expect(landingMarinePose(base, l, 0, START + l.approachMs)).toBe(base);
  });
  it("sails longer over longer routes, within bounds, and delays the unloading to match", () => {
    const route = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, z: 0 }));
    expect(sailMsForRoute(route(1))).toBe(SAIL_MS);
    expect(sailMsForRoute(route(30))).toBeGreaterThan(sailMsForRoute(route(10)));
    expect(sailMsForRoute(route(10_000))).toBeLessThanOrEqual(8000);
    const l = landing();
    expect(l.sailMs).toBeGreaterThanOrEqual(SAIL_MS);
    expect(l.approachMs).toBe(l.sailMs + RAMP_MS + UNLOAD_MS);
    // The unload must outlast the last marine's staggered departure (up to 1080ms).
    expect(UNLOAD_MS).toBeGreaterThan(1080 + 300);
  });
  it("keeps sea routes continuous across the world seam and reverses them for return attacks", () => {
    const wrapped = { dockPairs: [{ ax: WORLD_WIDTH - 2, ay: 1, bx: 1, by: 1,
      route: [{ x: WORLD_WIDTH - 1, y: 1 }, { x: 0, y: 1 }] }],
      tiles: new Map([[`${WORLD_WIDTH - 1},1`, sea(WORLD_WIDTH - 1, 1)], ["0,1", sea(0, 1)]]) };
    const l = dockLandingFor(wrapped, WORLD_WIDTH - 2, 1, 1, 1, START)!;
    expect(l.route[0]!.x).toBe(-2); expect(l.inwardX).toBe(1);
    const back = dockLandingFor(wrapped, 1, 1, WORLD_WIDTH - 2, 1, START)!;
    expect(back.inwardX).toBe(-1); expect(back.route[0]!.x).toBe(2);
  });
  it("repositions the beached model with the scene origin and removes it after combat", () => {
    const scene = new Scene(); const fx = createDockCarrierOverlay(scene);
    const b = battle();
    fx.tick([b], START + 5000);
    const root = scene.children.find((child) => child.visible)!;
    const x = root.position.x; const z = root.position.z;
    fx.tick([{ ...b, tgtWorldX: 7, tgtWorldZ: 4 }], START + 6000);
    expect(root.position.x).toBeCloseTo(x + 7); expect(root.position.z).toBe(z + 4);
    fx.tick([], START + 7000); expect(scene.children.some((child) => child.visible)).toBe(false);
    fx.dispose(); expect(scene.children).toHaveLength(0);
  });
  it("trusts authoritative sea waypoints even when client terrain disagrees", () => {
    const tiles = new Map(state.tiles);
    for (const [key, tile] of tiles) tiles.set(key, { ...tile, terrain: "LAND" });
    for (const [x, y] of [[5, 0], [5, 2], [6, 1]]) tiles.set(`${x},${y}`, { x: x!, y: y!, terrain: "LAND" });
    const result = dockLandingFor({ ...state, tiles }, 1, 1, 5, 1, START);
    expect(result?.route.map((p) => p.x)).toEqual([-3, -2, -1, -0.72]);
  });
  it("lands beside the authoritative coast for a dock two tiles inland", () => {
    const pair = { ...state.dockPairs[0]!, bx: 6 };
    const tiles = new Map(state.tiles);
    for (const [x, y] of [[6, 0], [6, 2], [5, 1], [7, 1]]) tiles.set(`${x},${y}`, { x: x!, y: y!, terrain: "LAND" });
    const result = dockLandingFor({ dockPairs: [pair], tiles }, 1, 1, 6, 1, START);
    expect(result?.route.at(-1)?.x).toBeCloseTo(-1.72);
  });
  it("draws the nearest world copy of a sailing carrier on a long sea route", () => {
    const scene = new Scene(); const fx = createDockCarrierOverlay(scene);
    const b = battle();
    fx.tick([{ ...b, tgtWorldX: -239.5, landing: { ...b.landing!, route: [{ x: -389, z: 0 }, { x: -0.72, z: 0 }] } }], START);
    expect(scene.children.find((child) => child.visible)?.position.x).toBeCloseTo(11.5);
    fx.dispose();
  });

});
