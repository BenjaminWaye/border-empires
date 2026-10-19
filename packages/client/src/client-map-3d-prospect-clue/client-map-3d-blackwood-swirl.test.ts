import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, InstancedMesh, Scene, ShaderMaterial, type Camera, type WebGLRenderer } from "three";
import { createBlackwoodSwirls } from "./client-map-3d-blackwood-swirl.js";
import { BLACKWOOD_SWIRL_ACTIVE_S, BLACKWOOD_SWIRL_PERIOD_S, blackwoodSwirlPhaseS } from "../client-prospect-clue/client-prospect-clue.js";

// Review finding: the 3D swirl ran off performance.now() (the 2D one off
// Date.now()) and baked rounded timing into the shader, so a tile swirled at
// different moments in the two renderers.
describe("createBlackwoodSwirls", () => {
  afterEach(() => vi.restoreAllMocks());

  it("feeds the shader the same epoch clock and timing as the 2D swirl", () => {
    const scene = new Scene();
    const swirls = createBlackwoodSwirls(scene, 4);
    swirls.addTile(0, 0, 0, 7, 3);
    swirls.commit();
    const mesh = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh)!;
    const material = mesh.material as ShaderMaterial;
    vi.spyOn(Date, "now").mockReturnValue(1_792_324_636_538);
    mesh.onBeforeRender({} as WebGLRenderer, scene, {} as Camera, mesh.geometry, material, new Group());
    expect(material.uniforms.uTime!.value).toBeCloseTo((1_792_324_636.538) % BLACKWOOD_SWIRL_PERIOD_S, 5);
    expect(material.uniforms.uPeriod!.value).toBe(BLACKWOOD_SWIRL_PERIOD_S);
    expect(material.uniforms.uActive!.value).toBe(BLACKWOOD_SWIRL_ACTIVE_S);
    expect(mesh.geometry.getAttribute("aPhase").getX(0)).toBeCloseTo(blackwoodSwirlPhaseS(7, 3), 5);
    swirls.dispose();
  });
});
