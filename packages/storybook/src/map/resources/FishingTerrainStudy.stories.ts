import { Box3, CanvasTexture, Mesh, MeshStandardMaterial, PCFSoftShadowMap, Vector3 } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHeightfield } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { fishingModelFitMatrix } from "@client/client-map-3d-fishing/client-map-3d-fishing.js";
import { applyBuildingEnvMap } from "@client/client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { createResourcePreviewAtmosphere } from "../../fixtures/resource-preview-atmosphere.js";
import { createFishStudyFoundation } from "../../fixtures/fish-study-foundation.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

const CENTER = 100;
const concreteTexture = (): CanvasTexture => {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Apron study needs a canvas context");
  const pixels = ctx.createImageData(64, 64);
  let seed = 731;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 177 + (seed >>> 27);
    pixels.data.set([value, value + 2, value + 1, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  return new CanvasTexture(canvas);
};

const render = (): HTMLElement => {
  const page = document.createElement("div");
  page.style.cssText = "padding:20px;background:#202c29;color:#e3dfce;font:15px system-ui";
  page.innerHTML = `<h2 style="font-weight:500;margin:0 0 8px">Fish tile on game terrain</h2>
    <p style="margin:0 0 20px">Blender proposal · same terrain, lighting and camera · preview only</p>`;
  const panels = document.createElement("div");
  panels.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px";
  page.appendChild(panels);
  for (const apron of [false, true]) {
    const panel = document.createElement("section");
    panel.innerHTML = `<h3 style="font-weight:500;margin:0 0 10px">${apron ? "B · Thin gray stone apron" : "A · Directly on grass"}</h3>`;
    const stage = createStage({ width: 640, height: 600, camera: "orthographic", orthoHalfHeight: 0.88 });
    // Use the production rig alone, without the fixture's extra studio lights.
    for (const object of [...stage.scene.children]) stage.scene.remove(object);
    stage.camera.position.set(1.8, 1.65, 2.2);
    stage.camera.lookAt(0.5, 0.16, 0.5);
    stage.renderer.shadowMap.enabled = true;
    stage.renderer.shadowMap.type = PCFSoftShadowMap;
    const atmosphere = createResourcePreviewAtmosphere(stage.scene, stage.renderer);
    atmosphere.updateShadowFrame(3);
    atmosphere.updateShadowTarget(0.5, 0.5);
    const terrain = createHeightfield();
    terrain.rebuild({ camX: CENTER, camY: CENTER, halfW: 5, halfH: 5,
      worldWidth: 240, worldHeight: 240, tileKindAt: () => "GRASS" });
    terrain.setGridlinesVisible(true);
    terrain.mesh.receiveShadow = true;
    stage.scene.add(terrain.mesh, terrain.skirtMesh, terrain.gridlines);
    const corners = [terrain.cornerYAt(CENTER, CENTER), terrain.cornerYAt(CENTER + 1, CENTER),
      terrain.cornerYAt(CENTER, CENTER + 1), terrain.cornerYAt(CENTER + 1, CENTER + 1)] as const;
    const cleanups: Array<() => void> = [terrain.dispose, atmosphere.dispose];
    let surfaceY = Math.max(terrain.elevationAt(CENTER, CENTER), ...corners) + 0.012;
    if (apron) {
      const foundation = createFishStudyFoundation(corners);
      const texture = concreteTexture();
      const material = new MeshStandardMaterial({ color: "#b8bab3", map: texture, roughness: 0.94, metalness: 0 });
      const mesh = new Mesh(foundation.geometry, material);
      mesh.receiveShadow = true;
      stage.scene.add(mesh);
      surfaceY = foundation.topY + 0.001;
      cleanups.push(() => { stage.scene.remove(mesh); foundation.geometry.dispose(); material.dispose(); texture.dispose(); });
    }
    let disposed = false;
    let release = (): void => {};
    cleanups.push(() => { disposed = true; release(); });
    new GLTFLoader().load("/studies/fishing-style-proposal.glb", (gltf) => {
      const model = gltf.scene;
      model.updateMatrixWorld(true);
      model.applyMatrix4(fishingModelFitMatrix(new Box3().setFromObject(model, true)));
      model.position.add(new Vector3(0.5, surfaceY, 0.5));
      model.traverse(node => {
        if (!(node instanceof Mesh)) return;
        node.castShadow = node.receiveShadow = true;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material instanceof MeshStandardMaterial) applyBuildingEnvMap(material, atmosphere.buildingEnvironmentTexture);
        }
      });
      release = () => {
        stage.scene.remove(model);
        model.traverse(node => {
          if (!(node instanceof Mesh)) return;
          node.geometry.dispose();
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
        });
      };
      if (disposed) release(); else stage.scene.add(model);
    });
    panel.appendChild(wrapWithCleanup(stage, cleanups));
    panels.appendChild(panel);
  }
  return page;
};

const meta: Meta = { title: "Map/Resources/Fishing terrain study", render };
export default meta;
type Story = StoryObj;
export const GrassAndGrayApron: Story = {};
