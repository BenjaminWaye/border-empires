import { BoxGeometry, InstancedMesh, Scene } from "three";
import { describe, expect, it, vi } from "vitest";

vi.mock("./popup-marine-asset.js", () => ({
  loadPopupMarineGeometry: () => Promise.resolve(new BoxGeometry(0.2, 0.6, 0.15))
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

const instancedMeshesIn = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);

describe("popup-marine overlay fx", () => {
  it("renders MARINES_PER_SIDE instances per side for one battle at t=lineup-end (full scale)", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    const battle = makeBattle();
    fx.tick(2400, [battle]); // just before lineup ends (LINEUP_MS=2500)

    const meshes = instancedMeshesIn(scene);
    // attacker mesh, defender mesh, flash mesh
    expect(meshes.length).toBe(3);
    const [attackerMesh, defenderMesh] = meshes;
    expect(attackerMesh!.count).toBe(MARINES_PER_SIDE);
    expect(defenderMesh!.count).toBe(MARINES_PER_SIDE);

    fx.dispose();
  });

  it("clears all instance counts once no battles/skirmishes remain", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    fx.tick(1000, [makeBattle()]);
    fx.tick(999_999, []);

    for (const mesh of instancedMeshesIn(scene)) expect(mesh.count).toBe(0);
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

    const [attackerMesh] = instancedMeshesIn(scene);
    // 4 marines from the battle + 4 from the skirmish, on the attacker side.
    expect(attackerMesh!.count).toBe(MARINES_PER_SIDE * 2);

    fx.dispose();
  });

  it("dispose() removes every instanced mesh from the scene", () => {
    const scene = new Scene();
    const fx = createPopupMarineOverlayFx(scene);
    fx.tick(1000, [makeBattle()]);
    fx.dispose();
    expect(instancedMeshesIn(scene).length).toBe(0);
  });
});
