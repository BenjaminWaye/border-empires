import { describe, expect, it } from "vitest";
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Scene } from "three";
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
