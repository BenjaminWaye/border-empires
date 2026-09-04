import { InstancedMesh, Scene, SkinnedMesh } from "three";
import { describe, expect, it, vi } from "vitest";

vi.mock("./popup-marine-asset.js", () => ({
  // Never resolves in these tests — exercises the synchronous placeholder
  // pool path (mirrors "model hasn't finished fetching yet" in the real
  // client), which is what the pool renders from immediately after
  // createPopupMarineOverlayFx() returns.
  loadPopupMarineTemplate: () => new Promise<never>(() => {})
}));

import { createPopupMarineOverlayFx } from "./popup-marine-overlay-fx.js";
import { APPROACH_MS, CLASH_MS, MARINES_PER_SIDE, ROUT_MS } from "./popup-marine-timeline.js";
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

const skinnedMeshesIn = (scene: Scene): SkinnedMesh[] =>
  scene.children.filter((c): c is SkinnedMesh => c instanceof SkinnedMesh);

const visibleSkinnedMeshesIn = (scene: Scene): SkinnedMesh[] => skinnedMeshesIn(scene).filter((m) => m.visible);

const flashMeshIn = (scene: Scene): InstancedMesh =>
  scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;

describe("popup-marine overlay fx", () => {
  it("renders MARINES_PER_SIDE visible SkinnedMesh marines per side for one battle at t=lineup-end (full scale)", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    const battle = makeBattle();
    fx.tick(2400, [battle]); // just before lineup ends (LINEUP_MS=2500)

    // 2 * MAX_MARINES pooled SkinnedMesh objects always sit in the scene
    // (attacker pool + defender pool), only some visible per tick.
    expect(visibleSkinnedMeshesIn(scene).length).toBe(MARINES_PER_SIDE * 2);

    fx.dispose();
  });

  it("clears every marine's visibility and the flash count once no battles/skirmishes remain", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    fx.tick(1000, [makeBattle()]);
    fx.tick(999_999, []);

    expect(visibleSkinnedMeshesIn(scene).length).toBe(0);
    expect(flashMeshIn(scene).count).toBe(0);
    fx.dispose();
  });

  it("renders both a resolved battle and a concurrent skirmish in the same tick", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    const battle = makeBattle();
    const skirmish: BattleOverlaySkirmishEntry = {
      srcWorldX: -1, srcWorldZ: 3,
      tgtWorldX: 1, tgtWorldZ: 3,
      srcSurfaceY: 0, tgtSurfaceY: 0,
      attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
      startAt: 0,
      hashSeed: 99
    };
    fx.tick(2400, [battle], [skirmish]);

    // 4 marines from the battle + 4 from the skirmish, on each side.
    expect(visibleSkinnedMeshesIn(scene).length).toBe(MARINES_PER_SIDE * 2 * 2);

    fx.dispose();
  });

  it("dispose() removes every pooled marine mesh and the flash mesh from the scene", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    fx.tick(1000, [makeBattle()]);
    fx.dispose();
    expect(skinnedMeshesIn(scene).length).toBe(0);
    expect(scene.children.some((c) => c instanceof InstancedMesh)).toBe(false);
  });

  it("poses limbs differently between crouch and pop-up-to-fire frames (real per-limb movement, not just position)", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    const battle = makeBattle();

    // Just after the firing line is reached (still mostly crouched).
    fx.tick(battle.clashAt + 1, [battle]);
    const crouchArmRot = visibleSkinnedMeshesIn(scene)[0]!.getObjectByName("armR_upper")!.rotation.x;
    const crouchLegRot = visibleSkinnedMeshesIn(scene)[0]!.getObjectByName("legL")!.rotation.x;

    // Scan the whole clash window for a frame where at least one marine is
    // popped up (crouchT high) and confirm its arm/leg bones differ from
    // the crouched frame above — this is what proves limb bones move, not
    // just the whole-body transform.
    let foundDivergentArm = false;
    let foundDivergentLeg = false;
    for (let t = battle.clashAt; t < battle.clashAt + CLASH_MS; t += 40) {
      fx.tick(t, [battle]);
      for (const mesh of visibleSkinnedMeshesIn(scene)) {
        const armRot = mesh.getObjectByName("armR_upper")!.rotation.x;
        const legRot = mesh.getObjectByName("legL")!.rotation.x;
        if (Math.abs(armRot - crouchArmRot) > 0.2) foundDivergentArm = true;
        if (Math.abs(legRot - crouchLegRot) > 0.2) foundDivergentLeg = true;
      }
    }
    expect(foundDivergentArm).toBe(true);
    expect(foundDivergentLeg).toBe(true);

    fx.dispose();
  });
});
