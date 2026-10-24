import type { Meta, StoryObj } from "@storybook/html-vite";
import { Light, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { createRelicState } from "@border-empires/shared";
import { createAtmosphere } from "@client/client-map-3d-atmosphere.js";
import { createRelicMapOverlay } from "../../../client/src/client-relic-overlay/relic-map-overlay.js";
import { drawRelicOverlay2D } from "../../../client/src/client-relic-overlay/relic-overlay-2d.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

const meta: Meta = {
  title: "Relics/Lifecycle", parameters: { layout: "fullscreen" },
  render: () => {
    const stage = createStage({ width: 1200, height: 500, cameraDistance: 7, cameraTilt: 0.9, background: "#24343a" });
    for (const light of stage.scene.children.filter(object => object instanceof Light)) stage.scene.remove(light);
    const atmosphere = createAtmosphere(stage.scene, stage.renderer);
    const groundGeometry = new PlaneGeometry(16, 12).rotateX(-Math.PI / 2);
    const groundMaterial = new MeshStandardMaterial({ color: "#74816b", roughness: 1 });
    const ground = new Mesh(groundGeometry, groundMaterial); ground.receiveShadow = true; stage.scene.add(ground);
    const overlay = createRelicMapOverlay(stage.scene, 3);
    const state = createRelicState("WARPRESS");
    const variants = [
      { x: -3, z: 0, y: 0, worldKey: "0,0", ownerColor: "#8a9b87", garrisoned: false, state },
      { x: 0, z: 0, y: 0, worldKey: "1,0", ownerId: "blue", ownerColor: "#3d7fd6", garrisoned: true, state },
      { x: 3, z: 0, y: 0, worldKey: "2,0", ownerId: "red", ownerColor: "#bf5350", garrisoned: true, state: { ...state, remainingUses: 0 } }
    ];
    for (const variant of variants) overlay.addInstance(variant); overlay.commit();
    let frame = 0;
    const animate = (): void => { overlay.update(performance.now()); frame = requestAnimationFrame(animate); }; animate();
    const root = wrapWithCleanup(stage, [() => cancelAnimationFrame(frame), overlay.dispose, atmosphere.dispose, () => groundGeometry.dispose(), () => groundMaterial.dispose()]);
    root.style.background = "#17221e"; root.style.color = "#f2e8d3"; root.style.font = "14px system-ui";
    const labels = document.createElement("p"); labels.textContent = "Dormant                                      Active · House banner                                      Depleted · reserve exhausted";
    labels.style.cssText = "margin:0;padding:12px;text-align:center;white-space:pre-wrap"; root.append(labels);
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 190; canvas.style.cssText = "width:100%;height:auto;background:#374238";
    const ctx = canvas.getContext("2d");
    if (ctx) for (const [i, variant] of variants.entries()) drawRelicOverlay2D(ctx, 130 + i * 400, 105, 100, variant.state, variant.garrisoned, variant.ownerId ? variant.ownerColor : undefined);
    root.append(canvas);
    return root;
  }
};
export default meta;
type Story = StoryObj;
export const MapStates: Story = {};
