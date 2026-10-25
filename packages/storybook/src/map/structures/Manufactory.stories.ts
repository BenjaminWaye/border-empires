import { renderStructureIdentityReview } from "./town-district-identity-review.js";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createStructureOverlay } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createStage, wrapWithCleanup } from "../../fixtures/three-stage.js";

// Focused story for the Manufactory industrial workshop. Renders the
// same generic StructureKind dispatch as StructureOverlay, centered on a
// single tile with a close camera so the sawtooth roof + flywheel read clearly.

type Args = {
  cameraDistance: number;
};

// Keep the brass flywheel assembly turning in every story — it is the
// manufactory's signature idle animation. Returns a cleanup that cancels the loop.
const startFlywheelSpin = (overlay: { update: (nowMs: number) => void }): (() => void) => {
  let rafId = 0;
  const animate = (): void => {
    overlay.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(rafId);
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1b1d22" });
  stage.camera.position.set(args.cameraDistance * 0.7, args.cameraDistance * 0.8, args.cameraDistance * 0.9);
  stage.camera.lookAt(0, 0.2, 0);
  const contactShadows = createContactShadowOverlay(stage.scene, 1);
  const overlay = createStructureOverlay(stage.scene, 1, contactShadows);
  overlay.addInstance(0, 0, 0, "MANUFACTORY");
  overlay.commit();
  const cancel = startFlywheelSpin(overlay);
  return wrapWithCleanup(stage, [cancel, overlay.dispose, contactShadows.dispose]);
};

const meta: Meta<Args> = {
  title: "Map/Structures/Legacy Manufactory",
  parameters: {
    docs: {
      description: {
        component:
          "Manufactory: a civilian industrial hall with a three-bay sawtooth roof, northlight glazing, twin smokestacks, belt-driven flywheel, an open machine shop, component conveyor and loading yard. Manufactured goods back the House’s offworld Coin credit."
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1.5, max: 8, step: 0.25 } }
  },
  args: { cameraDistance: 2 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const Default: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 1.5 } };
export const FullView: Story = { args: { cameraDistance: 3 } };

// Use the current map model for identity and gameplay-copy review.
export const CurrentProductionModel: Story = { render: () => renderStructureIdentityReview(["MANUFACTORY"]) };
