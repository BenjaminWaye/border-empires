// Coverage for the Planetary Defense patrol overlay's tile diffing, combat
// hand-off and tint — the real marine glb is mocked out with a minimal
// skinned rig so these run instantly without network/glb parsing.
import { AnimationClip, Bone, BufferGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Scene, Skeleton, SkinnedMesh, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createPlanetaryDefenseOverlay } from "./client-map-3d-planetary-defense-overlay.js";
import { PATROL_RADIUS, SOLDIERS_PER_TILE } from "./client-map-3d-planetary-defense-patrol.js";
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "./client-planetary-defense-style.js";
import { RENDER_ORDER } from "./client-map-3d-render-order.js";
import type { UnitMotionGate } from "./client-map-3d-unit-motion-gate/client-map-3d-unit-motion-gate.js";

vi.mock("./client-map-3d-popup-marine/popup-marine-asset.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client-map-3d-popup-marine/popup-marine-asset.js")>();
  const root = new Group();
  const bone = new Bone();
  bone.name = "Hips";
  const mesh = new SkinnedMesh(new BufferGeometry(), new MeshStandardMaterial());
  mesh.add(bone);
  mesh.bind(new Skeleton([bone]));
  root.add(mesh);
  const clips = new Map(["PistolWalk", "PistolIdle", "PistolRun", "PistolKneelingIdle"].map((name) => [name, new AnimationClip(name, 1, [])]));
  return { ...actual, loadPopupMarineTemplate: () => Promise.resolve({ root, clips }) };
});

// Node has no DOM canvas: hand the overlay a stand-in mark sprite (null = a blocked 2D context).
const markSprite: { current: { width: number; height: number } | null } = vi.hoisted(() => ({ current: { width: 128, height: 128 } }));
vi.mock("./client-insurgent-insignia.js", () => ({ insurgentMarkSprite: () => markSprite.current }));

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const visibleSoldiers = (scene: Scene): Object3D[] => scene.children.filter((c) => c.visible);

describe("createPlanetaryDefenseOverlay", () => {
  it("places dark-grey-armored soldiers patrolling inside the tile", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    overlay.clear();
    overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
    overlay.commit();
    overlay.tick(1000);

    const soldiers = visibleSoldiers(scene);
    expect(soldiers).toHaveLength(SOLDIERS_PER_TILE);
    for (const soldier of soldiers) {
      expect(Math.hypot(soldier.position.x - 10.5, soldier.position.z - 10.5)).toBeLessThanOrEqual(PATROL_RADIUS + 1e-6);
      const mesh = soldier.children.find((c): c is SkinnedMesh => c instanceof SkinnedMesh)!;
      expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe(PLANETARY_DEFENSE_ARMOR_COLOR.slice(1));
    }
    overlay.dispose();
  });

  it("walks around over time instead of standing still", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
    overlay.commit();
    const positions = new Set<string>();
    for (let t = 0; t < 20_000; t += 500) {
      overlay.tick(t);
      const first = visibleSoldiers(scene)[0]!;
      positions.add(`${first.position.x.toFixed(3)},${first.position.z.toFixed(3)}`);
    }
    expect(positions.size).toBeGreaterThan(5);
    overlay.dispose();
  });

  it("hides a tile's patrol while it is engaged in combat (the battle squad stands in for it), then shows it again", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
    overlay.commit();
    overlay.tick(1000, new Set(["10,10"]));
    expect(visibleSoldiers(scene)).toHaveLength(0);
    overlay.tick(1100, new Set());
    expect(visibleSoldiers(scene)).toHaveLength(SOLDIERS_PER_TILE);
    overlay.dispose();
  });

  it("moves the patrol across to an adjacent captured tile instead of popping", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
    overlay.commit();
    overlay.tick(0);

    overlay.clear();
    overlay.addInstance("11,10", 11.5, 10.5, 0, 11, 10);
    overlay.commit();
    overlay.tick(100);
    const early = visibleSoldiers(scene);
    expect(early).toHaveLength(SOLDIERS_PER_TILE);
    // Just started the move: still near the old tile.
    for (const soldier of early) expect(soldier.position.x).toBeLessThan(11);

    overlay.tick(10_000);
    for (const soldier of visibleSoldiers(scene)) {
      expect(Math.hypot(soldier.position.x - 11.5, soldier.position.z - 10.5)).toBeLessThanOrEqual(PATROL_RADIUS + 1e-6);
    }
    overlay.dispose();
  });

  it("does not jump when the camera window recenters in the same rebuild as a capture move", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
    overlay.commit();
    overlay.tick(0);
    const before = visibleSoldiers(scene).map((s) => ({ x: s.position.x, z: s.position.z }));

    // Same rebuild: the patrol moves 10,10 -> 11,10 AND the scene origin
    // shifts by -5 tiles on x, so tile 11,10 is drawn at 6.5 instead of 11.5.
    overlay.clear();
    overlay.addInstance("11,10", 6.5, 10.5, 0, 11, 10);
    overlay.commit();
    overlay.tick(1);
    const after = visibleSoldiers(scene);
    after.forEach((soldier, i) => {
      // Same spot in the new frame: shifted by exactly the -5 recenter.
      expect(soldier.position.x).toBeCloseTo(before[i]!.x - 5, 2);
      expect(soldier.position.z).toBeCloseTo(before[i]!.z, 2);
    });
    overlay.dispose();
  });

  it("removes the patrol when the tile is lost with no adjacent gain", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
    overlay.commit();
    overlay.tick(0);
    overlay.clear();
    overlay.commit();
    overlay.tick(100);
    expect(visibleSoldiers(scene)).toHaveLength(0);
    overlay.dispose();
  });

  it("caps rendered tiles rather than throwing when there are more Planetary Defense tiles than the pool", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    for (let i = 0; i < 200; i += 1) overlay.addInstance(`t-${i}`, i * 3, 0, 0, i * 3, 0);
    expect(() => overlay.commit()).not.toThrow();
    overlay.tick(0);
    expect(visibleSoldiers(scene).length).toBeLessThan(200 * SOLDIERS_PER_TILE);
    overlay.dispose();
  });

  describe("standing still (slow device / reduced motion)", () => {
    const gate = (animate: { value: boolean }): UnitMotionGate => ({ recordFrame: () => {}, shouldAnimate: () => animate.value, prefersReducedMotion: () => false });
    const spots = (scene: Scene): string[] => visibleSoldiers(scene).map((s) => `${s.position.x.toFixed(4)},${s.position.z.toFixed(4)}`);

    it("keeps the soldiers in one spot inside the tile over time", async () => {
      const scene = new Scene();
      const overlay = createPlanetaryDefenseOverlay(scene, gate({ value: false }));
      await flush();
      overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
      overlay.commit();
      overlay.tick(0);
      const first = spots(scene);
      expect(first).toHaveLength(SOLDIERS_PER_TILE);
      for (let t = 500; t < 20_000; t += 500) {
        overlay.tick(t);
        expect(spots(scene)).toEqual(first);
      }
      for (const soldier of visibleSoldiers(scene)) {
        expect(Math.hypot(soldier.position.x - 10.5, soldier.position.z - 10.5)).toBeLessThanOrEqual(PATROL_RADIUS + 1e-6);
      }
      overlay.dispose();
    });

    it("re-places the patrol on an adjacent captured tile without a jog", async () => {
      const scene = new Scene();
      const overlay = createPlanetaryDefenseOverlay(scene, gate({ value: false }));
      await flush();
      overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
      overlay.commit();
      overlay.tick(0);
      overlay.clear();
      overlay.addInstance("11,10", 11.5, 10.5, 0, 11, 10);
      overlay.commit();
      overlay.tick(100);
      for (const soldier of visibleSoldiers(scene)) {
        expect(Math.hypot(soldier.position.x - 11.5, soldier.position.z - 10.5)).toBeLessThanOrEqual(PATROL_RADIUS + 1e-6);
      }
      overlay.dispose();
    });

    it("comes back after a fight and resumes walking once motion is allowed again", async () => {
      const scene = new Scene();
      const animate = { value: false };
      const overlay = createPlanetaryDefenseOverlay(scene, gate(animate));
      await flush();
      overlay.addInstance("10,10", 10.5, 10.5, 0, 10, 10);
      overlay.commit();
      overlay.tick(0, new Set(["10,10"]));
      expect(visibleSoldiers(scene)).toHaveLength(0);
      overlay.tick(100, new Set());
      expect(visibleSoldiers(scene)).toHaveLength(SOLDIERS_PER_TILE);

      animate.value = true;
      const positions = new Set<string>();
      for (let t = 1_000; t < 20_000; t += 500) {
        overlay.tick(t);
        positions.add(spots(scene)[0]!);
      }
      expect(positions.size).toBeGreaterThan(5);
      overlay.dispose();
    });
  });
});

// Regression: Insurgent frontier tiles had no 3D marker at all and read as empty terrain.
describe("Insurgent frontier insignia (3D)", () => {
  const insigniaMesh = (scene: Scene): InstancedMesh =>
    scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh && c.name === "insurgent-insignia-overlay")!;

  it("stamps one flat insignia per frontier tile and hides it when none are left", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    overlay.clear();
    overlay.addFrontierInsignia(3.5, 4.5, 0.2);
    overlay.addFrontierInsignia(4.5, 4.5, 0.2);
    overlay.commit();
    const mesh = insigniaMesh(scene);
    expect(mesh.visible).toBe(true);
    expect(mesh.count).toBe(2);
    const m = new Matrix4();
    mesh.getMatrixAt(0, m);
    const pos = new Vector3().setFromMatrixPosition(m);
    expect(pos.x).toBeCloseTo(3.5);
    expect(pos.z).toBeCloseTo(4.5);
    expect(pos.y).toBeGreaterThan(0.2);

    overlay.clear();
    overlay.commit();
    expect(mesh.visible).toBe(false);
    overlay.dispose();
    expect(scene.children.includes(mesh)).toBe(false);
  });

  it("draws over the owner tint but under the fog layers", () => {
    expect(RENDER_ORDER.insurgentInsignia).toBeGreaterThan(RENDER_ORDER.ownershipFrontier);
    expect(RENDER_ORDER.insurgentInsignia).toBeLessThan(RENDER_ORDER.fogDarkenSettled);
  });

  // Review: the camp-or-mark choice lived inline in client-map-3d.ts, untested.
  it("puts soldiers on a camp, the mark on its frontier, and nothing on a tile of unknown state", async () => {
    const scene = new Scene();
    const overlay = createPlanetaryDefenseOverlay(scene);
    await flush();
    const at = { worldX: 1.5, worldZ: 1.5, surfaceY: 0, flatOverlayY: 0, wx: 1, wy: 1 };
    overlay.clear();
    expect(overlay.addTile({ ownerId: "barbarian-1", ownershipState: "SETTLED" }, "1,1", at)).toBe("camp");
    expect(overlay.addTile({ ownerId: "barbarian-1", ownershipState: "FRONTIER" }, "2,1", { ...at, worldX: 2.5, wx: 2 })).toBe("mark");
    expect(overlay.addTile({ ownerId: "barbarian-1" }, "3,1", { ...at, worldX: 3.5, wx: 3 })).toBeUndefined();
    overlay.commit();
    overlay.tick(1000);
    expect(insigniaMesh(scene).count).toBe(1);
    expect(scene.children.filter((c) => c.visible && c.name !== "insurgent-insignia-overlay")).toHaveLength(SOLDIERS_PER_TILE);
    overlay.dispose();
  });

  // Review: with no texture an unmapped plane renders as a solid white square on every frontier tile.
  it("stays hidden when the mark sprite could not be painted", async () => {
    markSprite.current = null;
    try {
      const scene = new Scene();
      const overlay = createPlanetaryDefenseOverlay(scene);
      await flush();
      overlay.clear();
      overlay.addFrontierInsignia(3.5, 4.5, 0.2);
      overlay.commit();
      expect(insigniaMesh(scene).visible).toBe(false);
      overlay.dispose();
    } finally {
      markSprite.current = { width: 128, height: 128 };
    }
  });
});
