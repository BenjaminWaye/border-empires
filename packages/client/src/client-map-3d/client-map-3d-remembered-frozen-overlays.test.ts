import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene, type Object3D } from "three";
import { createWatchtowerOverlay } from "../client-map-3d-watchtower-overlay.js";
import { createWaystationOverlay } from "../client-map-3d-waystation-overlay.js";
import { createSiegeMachineOverlay } from "../client-map-3d-siege-machine-overlay.js";
import { AFC_MODULE_FAMILY_TECH_IDS, createAfcOverlayGroup } from "../client-map-3d-afc-module-family.js";

// Buildings remembered under fog must hold still: their per-frame update
// leaves a frozen instance's matrices exactly where commit put them.
const matricesOf = (root: Object3D): number[] => {
  const out: number[] = [];
  root.traverse((child) => { if (child instanceof InstancedMesh) out.push(...Array.from(child.instanceMatrix.array.slice(0, child.count * 16))); });
  return out;
};

describe("frozen overlay instances (remembered under fog)", () => {
  it("watchtower: no gear spin or reveal pulse", () => {
    const scene = new Scene();
    const overlay = createWatchtowerOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, 3, 4, { activated: true, revealUntil: Number.MAX_SAFE_INTEGER }, true);
    overlay.commit();
    overlay.update(1000);
    const before = matricesOf(scene);
    overlay.update(7000);
    expect(matricesOf(scene)).toEqual(before);
  });

  it("waystation: no vane spin", () => {
    const scene = new Scene();
    const overlay = createWaystationOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, 3, 4, { activated: false }, true);
    overlay.commit();
    overlay.update(1000);
    const before = matricesOf(scene);
    overlay.update(7000);
    expect(matricesOf(scene)).toEqual(before);
  });

  it("siege machine: frozen heads hold still while a live one spins", () => {
    const frozenScene = new Scene();
    const frozen = createSiegeMachineOverlay(frozenScene, 4);
    frozen.addInstance(0, 0, 0, 3, 4, 0, true);
    frozen.commit();
    const before = matricesOf(frozenScene);
    frozen.tick(5000);
    expect(matricesOf(frozenScene)).toEqual(before);

    const liveScene = new Scene();
    const live = createSiegeMachineOverlay(liveScene, 4);
    live.addInstance(0, 0, 0, 3, 4, 0);
    live.commit();
    const liveBefore = matricesOf(liveScene);
    live.tick(5000);
    expect(matricesOf(liveScene)).not.toEqual(liveBefore);
  });

  it("AFC: the complex and every docked module family hold still while a live AFC animates", () => {
    // Every family, a few at a time (an AFC has a limited number of sockets).
    const groups: string[][] = [];
    for (let i = 0; i < AFC_MODULE_FAMILY_TECH_IDS.length; i += 4) groups.push(AFC_MODULE_FAMILY_TECH_IDS.slice(i, i + 4));
    for (const modules of groups) {
      const frozenScene = new Scene();
      const frozen = createAfcOverlayGroup(frozenScene, 4);
      frozen.addAfc(0, 0, 0, 3, 4, modules, true);
      frozen.commit();
      frozen.update(1000);
      const before = matricesOf(frozenScene);
      frozen.update(7000);
      expect(matricesOf(frozenScene), modules.join()).toEqual(before);
      frozen.dispose();
    }
    const liveScene = new Scene();
    const live = createAfcOverlayGroup(liveScene, 4);
    live.addAfc(0, 0, 0, 3, 4, ["trade"]);
    live.commit();
    live.update(1000);
    const liveBefore = matricesOf(liveScene);
    live.update(7000);
    expect(matricesOf(liveScene)).not.toEqual(liveBefore);
    live.dispose();
  });
});
