import { afterEach, describe, expect, it, vi } from "vitest";
import { InstancedMesh, Scene } from "three";
import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import { resetCaptureAftermathIndex } from "./client-capture-aftermath/client-capture-aftermath.js";
import { createCaptureAftermathFx3D } from "./client-map-3d-capture-aftermath-fx.js";
import type { Tile } from "./client-types.js";

afterEach(() => { vi.useRealTimers(); resetCaptureAftermathIndex(); });

describe("createCaptureAftermathFx3D", () => {
  it("drops rubble around a wrecked fort and smoke over a captured resource, and asks for a rebuild when the hold ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const scene = new Scene();
    const smoke: number[] = [];
    const fx = createCaptureAftermathFx3D(scene, { addCapturedTownSmoke: (x) => { smoke.push(x); } });
    const mesh = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh)!;
    const held = { x: 1, y: 1, terrain: "LAND", ownerId: "p2", ownershipState: "FRONTIER", captureHoldUntil: Date.now() + CAPTURE_HOLD_MS } as Tile;

    fx.clear();
    fx.addTile({ ...held, fort: { ownerId: "p2", status: "active", variant: "FORT" } } as Tile, "1,1", 0, 0, 0, 7);
    fx.addTile({ ...held, x: 2, resource: "IRON" } as Tile, "2,1", 1, 0, 0, 9);
    fx.addTile({ x: 3, y: 1, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED" } as Tile, "3,1", 2, 0, 0, 11);
    fx.commit();

    expect(mesh.count).toBeGreaterThan(0);
    expect(smoke).toEqual([1]);
    expect(fx.boundaryPassed()).toBe(false);
    vi.setSystemTime(1_000_000 + CAPTURE_HOLD_MS);
    expect(fx.boundaryPassed()).toBe(true);

    fx.clear();
    fx.commit();
    expect(mesh.count).toBe(0);
    expect(fx.boundaryPassed()).toBe(false);
    fx.dispose();
    expect(scene.children).not.toContain(mesh);
  });
});

describe("createCaptureAftermathFx3D battle scars", () => {
  it("draws scars on a scarred tile and asks for a rebuild when they fade", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);
    const scene = new Scene();
    const fx = createCaptureAftermathFx3D(scene, { addCapturedTownSmoke: () => {} });
    fx.clear();
    fx.addTile({ x: 1, y: 1, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", warScarLevel: 2, warScarUntil: Date.now() + 1_000 } as Tile, "1,1", 0, 0, 0, 7);
    fx.commit();
    const drawn = scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh).reduce((sum, mesh) => sum + mesh.count, 0);
    expect(drawn).toBeGreaterThan(0);
    expect(fx.boundaryPassed()).toBe(false);
    vi.setSystemTime(2_001_000);
    expect(fx.boundaryPassed()).toBe(true);
    fx.dispose();
  });
});
