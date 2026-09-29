import type { Meta, StoryObj } from "@storybook/html-vite";
import { Scene } from "three";
import { AFC_MODULE_DOCK_HEIGHT, afcSocketPlacement, createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { createTitaniumForgeModuleOverlay } from "@client/client-map-3d-titanium-forge-module.js";
import { createRiggingWorksModuleOverlay } from "@client/client-map-3d-rigging-works-module.js";
import { createAfcModuleDeliveryFxLayer } from "@client/client-map-3d-afc-module-delivery-fx.js";
import { glintStage, createContactShadow, startUpdateLoop } from "./FabricationComplex.stories.js";
import { wrapWithCleanup } from "../three-stage.js";

// Built from real production code (createAfcModuleDeliveryFxLayer is the
// actual FX layer client-map-3d.ts spawns when a module docks on your AFC).
const buildScene = (scene: Scene): (() => void)[] => {
  const cleanups: (() => void)[] = [];
  const shadow = createContactShadow(1.7);
  scene.add(shadow.mesh);
  cleanups.push(shadow.dispose);

  const afc = createFabricationComplexOverlay(scene, 1);
  const index = afc.addInstance(0, 0, 0, 5, 5);
  afc.commit();

  // A couple of already-docked modules for context, so the delivery lands
  // into a complex that already looks lived-in rather than an empty shell.
  const forge = createTitaniumForgeModuleOverlay(scene, 8);
  const rigging = createRiggingWorksModuleOverlay(scene, 8);
  const attachments = afc.moduleSocketAttachments(index);
  const forgeAttachment = attachments[0];
  const riggingAttachment = attachments[1];
  if (forgeAttachment) forge.addInstance(forgeAttachment.x, forgeAttachment.z, forgeAttachment.y, forgeAttachment.yaw, 6, 5);
  if (riggingAttachment) rigging.addInstance(riggingAttachment.x, riggingAttachment.z, riggingAttachment.y, riggingAttachment.yaw, 5, 6);
  forge.commit();
  rigging.commit();

  const deliveryFx = createAfcModuleDeliveryFxLayer(scene);
  // Same targeting as the live game (syncAfcModuleDeliveryFxQueue): the
  // streak lands on the socket the module docks into. Cycles through the
  // sockets that are still empty so each replay shows a different slot.
  let nextSlot = 2;
  const replay = (): void => {
    const { dx, dz } = afcSocketPlacement(nextSlot);
    nextSlot = nextSlot >= 7 ? 2 : nextSlot + 1;
    deliveryFx.spawn(0, 0, 0, performance.now(), { dx, dy: AFC_MODULE_DOCK_HEIGHT, dz });
  };
  replay();

  cleanups.push(
    startUpdateLoop([afc, forge, rigging, deliveryFx]),
    afc.dispose,
    forge.dispose,
    rigging.dispose,
    deliveryFx.dispose
  );

  (scene.userData as { replayDelivery?: () => void }).replayDelivery = replay;
  return cleanups;
};

const meta: Meta = {
  title: "3D Library/AfcModuleDeliveryFx",
  parameters: {
    docs: {
      description: {
        component:
          "Prototype for the AFC module delivery animation (docs/manifest-afc-module-delivery-animation-plan.md): a warm gradient-textured streak burns down from altitude shedding embers, then lands in a flash/shockwave/smoke cloud with a lingering reveal glow. Click Replay to run it again."
      }
    }
  },
  render: () => {
    const stage = glintStage({ cameraDistance: 6.5, cameraTilt: 0.85 });
    const cleanups = buildScene(stage.scene);
    const root = wrapWithCleanup(stage, cleanups);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Replay delivery";
    button.style.cssText =
      "position:absolute;top:12px;left:12px;z-index:10;padding:8px 16px;border-radius:8px;border:1px solid rgba(255,214,148,0.5);background:linear-gradient(180deg,rgba(255,214,148,0.22),rgba(214,150,68,0.14));color:#ffe6b8;font:700 13px system-ui,sans-serif;cursor:pointer;";
    button.addEventListener("click", () => {
      (stage.scene.userData as { replayDelivery?: () => void }).replayDelivery?.();
    });
    root.style.position = "relative";
    root.appendChild(button);
    return root;
  }
};

export default meta;
type Story = StoryObj;

export const Delivery: Story = {};
