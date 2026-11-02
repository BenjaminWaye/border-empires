import { afterEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, Scene } from "three";
import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import { noteRazedStructuresOnCapture, resetCaptureAftermathIndex } from "./client-capture-aftermath/client-capture-aftermath.js";
import { createCaptureAftermathFx3D } from "./client-map-3d-capture-aftermath-fx.js";
import type { Tile } from "./client-types.js";

afterEach(() => { vi.useRealTimers(); resetCaptureAftermathIndex(); });

const wreckMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh && child.name.startsWith("wreck-") && child.count > 0);

describe("createCaptureAftermathFx3D", () => {
  it("lays a razed beacon's wreck, a burning resource and battle scars, and asks for a rebuild when the earliest ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const scene = new Scene();
    const fx = createCaptureAftermathFx3D(scene, { addCapturedTownSmoke: () => {} });
    const held = { terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER", captureHoldUntil: Date.now() + CAPTURE_HOLD_MS } as const;
    const beacon = { x: 1, y: 1, ...held } as Tile;
    noteRazedStructuresOnCapture({ ...beacon, ownerId: "p1", economicStructure: { ownerId: "p1", type: "RELAY_BEACON", status: "active" } } as Tile, beacon, "1,1");

    fx.clear();
    fx.addTile(beacon, "1,1", 0, 0, 0, 7);
    fx.addTile({ x: 2, y: 1, ...held, resource: "IRON" } as Tile, "2,1", 1, 0, 0, 9);
    fx.addTile({ x: 3, y: 1, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED", warScarLevel: 3, warScarUntil: Date.now() + 5 * CAPTURE_HOLD_MS } as Tile, "3,1", 2, 0, 0, 11);
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
