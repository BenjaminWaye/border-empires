import { Group, InstancedMesh, Object3D, Scene, SkinnedMesh } from "three";
import { describe, expect, it, vi } from "vitest";

// A stand-in for the real .glb (the real asset is covered separately by
// popup-marine-asset.test.ts). Each stance's clip parks the Hips bone at a
// DIFFERENT x, so a test can read that bone back after a tick and tell
// which clip the overlay actually chose — the overlay never exposes its
// mixers, and "which animation is this marine playing" is exactly the
// behaviour worth pinning now that stance comes from real clips rather than
// hand-rolled bone math.
const HIPS_X_BY_CLIP: Record<string, number> = { PistolRun: 1, PistolIdle: 2, PistolKneelingIdle: 3 };

vi.mock("./popup-marine-asset.js", async () => {
  const THREE = await import("three");
  const makeTemplate = () => {
    const hips = new THREE.Bone();
    hips.name = "Hips";
    const hand = new THREE.Bone();
    hand.name = "RightHand";
    hips.add(hand);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = "char1";

    const root = new THREE.Group();
    root.name = "Armature";
    root.add(mesh);
    root.add(hips);
    mesh.bind(new THREE.Skeleton([hips, hand]));

    const clips = new Map(
      Object.entries(HIPS_X_BY_CLIP).map(([name, x]) => [
        name,
        new THREE.AnimationClip(name, 1, [
          new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [x, 0, 0, x, 0, 0])
        ])
      ])
    );
    return { root, clips };
  };
  return {
    MARINE_CLIP_NAMES: { run: "PistolRun", stand: "PistolIdle", kneel: "PistolKneelingIdle" },
    firstSkinnedMesh: (root: Object3D): SkinnedMesh => {
      let found: SkinnedMesh | undefined;
      root.traverse((child) => {
        if (!found && child instanceof THREE.SkinnedMesh) found = child;
      });
      if (!found) throw new Error("test template has no SkinnedMesh");
      return found;
    },
    loadPopupMarineTemplate: () => Promise.resolve(makeTemplate())
  };
});

import { createPopupMarineOverlayFx } from "./popup-marine-overlay-fx.js";
import { APPROACH_MS, CLASH_MS, LINEUP_MS, MARINES_PER_SIDE, ROUT_MS } from "./popup-marine-timeline.js";
import type { BattleOverlayRenderEntry, BattleOverlaySkirmishEntry } from "./popup-marine-timeline.js";

const makeBattle = (overrides: Partial<BattleOverlayRenderEntry> = {}): BattleOverlayRenderEntry => ({
  srcWorldX: -1, srcWorldZ: 0,
  tgtWorldX: 1, tgtWorldZ: 0,
  srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
  attackerWon: true,
  startAt: 0,
  clashAt: APPROACH_MS,
  endAt: APPROACH_MS + CLASH_MS + ROUT_MS,
  fromSkirmish: false,
  hashSeed: 7,
  ...overrides
});

const marinesIn = (scene: Scene): Group[] => scene.children.filter((c): c is Group => c instanceof Group);
const visibleMarinesIn = (scene: Scene): Group[] => marinesIn(scene).filter((m) => m.visible);
const instancedIn = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
const flashMeshIn = (scene: Scene): InstancedMesh => instancedIn(scene)[0]!;
const boltMeshIn = (scene: Scene): InstancedMesh => instancedIn(scene)[1]!;
const sparkMeshIn = (scene: Scene): InstancedMesh => instancedIn(scene)[2]!;

/** Which stance clip a rendered marine is actually playing. */
const stanceOf = (marine: Object3D): string | undefined => {
  const x = marine.getObjectByName("Hips")!.position.x;
  return Object.keys(HIPS_X_BY_CLIP).find((name) => Math.abs(HIPS_X_BY_CLIP[name]! - x) < 0.01);
};

/** The pools are built when the (async) template load resolves. */
const createLoadedFx = async (scene: Scene) => {
  const fx = createPopupMarineOverlayFx(scene);
  await Promise.resolve();
  await Promise.resolve();
  return fx;
};

describe("popup-marine overlay fx", () => {
  it("renders MARINES_PER_SIDE visible marines per side for one battle", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    fx.tick(2400, [makeBattle()]); // just before lineup ends (LINEUP_MS=2500)
    expect(visibleMarinesIn(scene).length).toBe(MARINES_PER_SIDE * 2);
    fx.dispose();
  });

  it("clears every marine's visibility and the flash/bolt counts once no battles remain", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    fx.tick(1000, [makeBattle()]);
    fx.tick(999_999, []);
    expect(visibleMarinesIn(scene).length).toBe(0);
    expect(flashMeshIn(scene).count).toBe(0);
    expect(boltMeshIn(scene).count).toBe(0);
    expect(sparkMeshIn(scene).count).toBe(0);
    fx.dispose();
  });

  it("renders both a resolved battle and a concurrent skirmish in the same tick", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    const skirmish: BattleOverlaySkirmishEntry = {
      srcWorldX: -1, srcWorldZ: 3,
      tgtWorldX: 1, tgtWorldZ: 3,
      srcSurfaceY: 0, tgtSurfaceY: 0,
      attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
      startAt: 0,
      hashSeed: 99
    };
    fx.tick(2400, [makeBattle()], [skirmish]);
    expect(visibleMarinesIn(scene).length).toBe(MARINES_PER_SIDE * 2 * 2);
    fx.dispose();
  });

  it("dispose() removes every pooled marine and both instanced effect meshes", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    fx.tick(1000, [makeBattle()]);
    fx.dispose();
    expect(marinesIn(scene).length).toBe(0);
    expect(instancedIn(scene).length).toBe(0);
  });

  it("runs while advancing, then plays a standing or kneeling firing clip", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    const battle = makeBattle();

    // Mid-march, not LINEUP_MS + 1: at the very start of the march every
    // marine is still sitting on its staggered start delay and is therefore
    // deliberately NOT in the run clip (it would be running on the spot).
    fx.tick((LINEUP_MS + battle.clashAt) / 2, [battle]);
    expect(visibleMarinesIn(scene).map(stanceOf)).toContain("PistolRun");

    fx.tick(battle.clashAt + CLASH_MS * 0.5, [battle]); // mid-firefight
    const firing = visibleMarinesIn(scene).map(stanceOf);
    expect(firing.length).toBeGreaterThan(0);
    for (const stance of firing) {
      expect(["PistolIdle", "PistolKneelingIdle"]).toContain(stance);
    }
    fx.dispose();
  });

  it("mixes standing and kneeling shooters within a squad", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    // Scan a few battles' worth of seeds: the kneel/stand split is a
    // per-marine hash, so this pins "a squad is not uniformly one stance"
    // without depending on one seed's exact draw.
    const seen = new Set<string | undefined>();
    for (const hashSeed of [1, 2, 3, 4, 5]) {
      const battle = makeBattle({ hashSeed });
      fx.tick(battle.clashAt + CLASH_MS * 0.5, [battle]);
      for (const marine of visibleMarinesIn(scene)) seen.add(stanceOf(marine));
    }
    expect(seen.has("PistolIdle")).toBe(true);
    expect(seen.has("PistolKneelingIdle")).toBe(true);
    fx.dispose();
  });

  it("strikes sparks off the marines being hit during the firefight", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    const battle = makeBattle();

    fx.tick(LINEUP_MS + 1, [battle]); // still advancing — nothing has been hit
    expect(sparkMeshIn(scene).count).toBe(0);

    let sawSparks = false;
    for (let t = battle.clashAt; t < battle.clashAt + CLASH_MS; t += 5) {
      fx.tick(t, [battle]);
      if (sparkMeshIn(scene).count > 0) sawSparks = true;
    }
    expect(sawSparks).toBe(true);
    fx.dispose();
  });

  it("puts laser bolts in the air during the firefight but not before it", async () => {
    const scene = new Scene();
    const fx = await createLoadedFx(scene);
    const battle = makeBattle();

    fx.tick(LINEUP_MS + 1, [battle]); // still advancing — nobody is shooting
    expect(boltMeshIn(scene).count).toBe(0);

    let sawBolts = false;
    for (let t = battle.clashAt; t < battle.clashAt + CLASH_MS; t += 20) {
      fx.tick(t, [battle]);
      if (boltMeshIn(scene).count > 0) sawBolts = true;
    }
    expect(sawBolts).toBe(true);
    fx.dispose();
  });
});
