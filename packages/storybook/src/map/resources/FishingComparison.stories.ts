import { Box3, Mesh } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createFishingOverlay, fishingModelFitMatrix } from "@client/client-map-3d-fishing/client-map-3d-fishing.js";
import { createResourcePreviewAtmosphere } from "../../fixtures/resource-preview-atmosphere.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

const render = (): HTMLElement => {
  const page = document.createElement("div");
  page.style.cssText = "background:#202c29;color:#e3dfce;font:15px system-ui;padding:24px";
  page.innerHTML = `<h2 style="font-weight:500;margin:0 0 8px">Fish basins · original / updated</h2>
    <p style="margin:0 0 24px">Same camera, lighting, orientation and tile footprint. Wooden bridge removed.</p>`;
  const panels = document.createElement("div");
  panels.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px";
  page.appendChild(panels);
  for (const original of [true, false]) {
    const panel = document.createElement("section");
    panel.innerHTML = `<h3 style="font-weight:500;margin:0 0 12px">${original ? "Original · fishing2.glb" : "Updated · no wooden bridge"}</h3>`;
    const stage = createStage({ width: 640, height: 480, background: "#202c29" });
    stage.camera.position.set(0.9, 0.85, 1.1);
    stage.camera.lookAt(0, 0.12, 0);
    const atmosphere = createResourcePreviewAtmosphere(stage.scene);
    const cleanups = [atmosphere.dispose];
    if (original) {
      let disposed = false;
      let release = (): void => {};
      cleanups.push(() => { disposed = true; release(); });
      new GLTFLoader().load("/models/fishing2.glb", (gltf) => {
        const model = gltf.scene;
        model.updateMatrixWorld(true);
        model.applyMatrix4(fishingModelFitMatrix(new Box3().setFromObject(model, true)));
        release = () => {
          stage.scene.remove(model);
          model.traverse((node) => {
            if (!(node instanceof Mesh)) return;
            // GLTFLoader owns these authored resources; unlike the shared
            // runtime overlay, this comparison disposes them with the stage.
            node.geometry.dispose();
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
          });
        };
        if (disposed) release();
        else stage.scene.add(model);
      });
    } else {
      const overlay = createFishingOverlay(stage.scene, 1, atmosphere.buildingEnvironmentTexture);
      overlay.addInstance(0, 0, 0, 100, 100, { dx: 1, dy: 0 });
      overlay.commit();
      cleanups.push(overlay.dispose);
    }
    panel.appendChild(wrapWithCleanup(stage, cleanups));
    panels.appendChild(panel);
  }
  return page;
};

const meta: Meta = { title: "Map/Resources/Fishing comparison", render };
export default meta;
type Story = StoryObj;
export const OriginalAndUpdated: Story = {};
