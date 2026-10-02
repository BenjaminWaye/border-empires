// Coverage for the Planetary Defense patrol overlay's tile diffing, combat
// hand-off and tint — the real marine glb is mocked out with a minimal
// skinned rig so these run instantly without network/glb parsing.
import { AnimationClip, Bone, BufferGeometry, Group, MeshStandardMaterial, Object3D, Scene, Skeleton, SkinnedMesh } from "three";
import { describe, expect, it, vi } from "vitest";
import { createPlanetaryDefenseOverlay } from "./client-map-3d-planetary-defense-overlay.js";
import { PATROL_RADIUS, SOLDIERS_PER_TILE } from "./client-map-3d-planetary-defense-patrol.js";
import { PLANETARY_DEFENSE_ARMOR_COLOR } from "./client-planetary-defense-style.js";

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
});
