import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Scene, Texture } from "three";
import { createStructurePieceBuilder } from "./client-map-3d-structure-builder.js";

// Regression: makeSlot() is the single choke point every economic/late-game/
// civic/infrastructure/industrial/manpower/worldbreaker/imperial-exchange/
// astral-dock/population-bureau structure piece funnels through -- it used
// to leave every slot's InstancedMesh at castShadow/receiveShadow's default
// (false), so structures never cast or received a real shadow the way trees
// now do (client-map-3d-forest.ts), reading as flatly lit by comparison.
describe("createStructurePieceBuilder shadow wiring", () => {
  it("makeSlot's InstancedMesh casts and receives shadows", () => {
    const scene = new Scene();
    const { builder, dispose } = createStructurePieceBuilder(scene, 4);
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshStandardMaterial();
    builder.makeSlot("test-slot", geo, mat, 4);
    const mesh = scene.children.find((c): c is InstancedMesh => c instanceof InstancedMesh);
    expect(mesh).toBeDefined();
    expect(mesh!.castShadow).toBe(true);
    expect(mesh!.receiveShadow).toBe(true);
    dispose();
  });
});

// Regression coverage for a live bug + its fix's own regression: metallic
// structure materials (mintworks and most other buildings) render near-black
// without an environment map to specularly reflect (client-map-3d-atmosphere.ts
// bakes one). A first version of that fix assigned the texture to
// `scene.environment`, which applies it as an IBL *diffuse* term to every
// MeshStandardMaterial in the scene -- including trees and terrain, which
// (being metalness: 0) actually pick up MORE of that diffuse wash than a
// metallic building does, visibly over-brightening everything else in the
// scene instead of just fixing the buildings. Giving each structure
// material its own `envMap` directly, through this shared choke point,
// keeps the fix scoped to only the materials that needed it.
describe("createStructurePieceBuilder building-environment wiring", () => {
  it("gives a slot's material the shared building environment texture, when one is provided", () => {
    const scene = new Scene();
    const envMap = new Texture();
    const { builder, dispose } = createStructurePieceBuilder(scene, 4, envMap);
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshStandardMaterial({ metalness: 0.8 });
    builder.makeSlot("test-slot", geo, mat, 4);
    expect(mat.envMap).toBe(envMap);
    dispose();
  });

  it("does not overwrite a material that already has its own envMap", () => {
    const scene = new Scene();
    const sharedEnvMap = new Texture();
    const ownEnvMap = new Texture();
    const { builder, dispose } = createStructurePieceBuilder(scene, 4, sharedEnvMap);
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshStandardMaterial({ envMap: ownEnvMap });
    builder.makeSlot("test-slot", geo, mat, 4);
    expect(mat.envMap).toBe(ownEnvMap);
    dispose();
  });

  it("leaves envMap unset when no building environment texture is provided (e.g. test callers)", () => {
    const scene = new Scene();
    const { builder, dispose } = createStructurePieceBuilder(scene, 4);
    const geo = new BoxGeometry(1, 1, 1);
    const mat = new MeshStandardMaterial();
    builder.makeSlot("test-slot", geo, mat, 4);
    expect(mat.envMap).toBeNull();
    dispose();
  });
});
