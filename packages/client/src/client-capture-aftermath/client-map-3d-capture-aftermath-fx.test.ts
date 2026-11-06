import { afterEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, Scene } from "three";
import { CAPTURE_HOLD_MS, RAZED_WRECK_DURATION_MS } from "@border-empires/shared";
import { createCaptureAftermathFx3D } from "./client-map-3d-capture-aftermath-fx.js";
import type { Tile } from "../client-types.js";

afterEach(() => { vi.useRealTimers(); });

const wreckMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh && child.name.startsWith("wreck-") && child.count > 0);

describe("createCaptureAftermathFx3D", () => {
  it("lays a razed beacon's wreck, a burning resource and battle scars, and asks for a rebuild when the earliest ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const scene = new Scene();
    const fx = createCaptureAftermathFx3D(scene, { addCapturedTownSmoke: () => {} });
    const held = { terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER", captureHoldUntil: Date.now() + CAPTURE_HOLD_MS } as const;
    const beacon = { x: 1, y: 1, ...held, razedWreck: "RELAY_BEACON", razedWreckUntil: Date.now() + RAZED_WRECK_DURATION_MS } as Tile;

    fx.clear();
    fx.addTile(beacon, 0, 0, 0, 1, 1);
    fx.addTile({ x: 2, y: 1, ...held, resource: "IRON" } as Tile, 1, 0, 0, 2, 1);
    fx.addTile({ x: 3, y: 1, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED", warScarLevel: 3, warScarUntil: Date.now() + 5 * CAPTURE_HOLD_MS } as Tile, 2, 0, 0, 3, 1);
    fx.commit();

    const names = wreckMeshes(scene).map((mesh) => mesh.name);
    expect(names.some((name) => name.startsWith("wreck-RELAY_BEACON-"))).toBe(true);
    expect(names.some((name) => name.startsWith("wreck-RESOURCE_FIRE-"))).toBe(true);
    expect(names.some((name) => name.startsWith("wreck-BATTLE_SCARS-3-"))).toBe(true);
    // Embers glow and smoke rises off the wrecks.
    expect(names.some((name) => name.endsWith("-glow"))).toBe(true);
    expect(names.some((name) => name.endsWith("-steam"))).toBe(true);
    expect(fx.boundaryPassed()).toBe(false);
    vi.setSystemTime(1_000_000 + CAPTURE_HOLD_MS);
    expect(fx.boundaryPassed()).toBe(true);

    fx.clear();
    fx.commit();
    expect(wreckMeshes(scene)).toEqual([]);
    fx.dispose();
    expect(scene.children.filter((child) => child.name.startsWith("wreck-"))).toEqual([]);
  });

  it("burns a fought-over forest's own trees instead of laying open-ground scars", () => {
    const scene = new Scene();
    const fx = createCaptureAftermathFx3D(scene, { addCapturedTownSmoke: () => {} });
    fx.clear();
    fx.addTile({ x: 5, y: 5, terrain: "LAND", warScarLevel: 4, warScarUntil: Date.now() + 60_000 } as Tile, 0, 0, 0, 5, 5, "TEMPERATE");
    fx.commit();
    const names = wreckMeshes(scene).map((mesh) => mesh.name);
    expect(names.some((name) => name.startsWith("wreck-FOREST_WAR-4-"))).toBe(true);
    expect(names.some((name) => name.startsWith("wreck-BATTLE_SCARS-"))).toBe(false);
    fx.dispose();
  });

  it("sets a captured dock ablaze on its quay, turned toward the water", () => {
    const scene = new Scene();
    // Water to the east of (10, 10): the quay faces +x.
    const fx = createCaptureAftermathFx3D(scene, { addCapturedTownSmoke: () => {} }, undefined, (x) => (x === 11 ? "SEA" : "LAND"));
    fx.clear();
    fx.addTile({ x: 10, y: 10, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER", captureHoldUntil: Date.now() + CAPTURE_HOLD_MS, dockId: "d1" } as Tile, 0, 0, 0, 10, 10);
    fx.commit();
    const fire = wreckMeshes(scene).filter((mesh) => mesh.name.startsWith("wreck-DOCK_FIRE-"));
    expect(fire.some((mesh) => mesh.name.endsWith("-glow"))).toBe(true);
    expect(fire.some((mesh) => mesh.name.endsWith("-steam"))).toBe(true);
    fx.dispose();
  });

  it("lays scorched ground under a breached fort, turned toward the smashed wall", () => {
    const scene = new Scene();
    const fx = createCaptureAftermathFx3D(scene, { addCapturedTownSmoke: () => {} });
    fx.clear();
    fx.addFortBreachGround(0, 0, 0, Math.PI / 2, 5);
    fx.commit();
    expect(wreckMeshes(scene).some((mesh) => mesh.name.startsWith("wreck-FORT_BREACH-"))).toBe(true);
    fx.dispose();
  });
});
