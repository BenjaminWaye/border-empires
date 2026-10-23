import type { Meta, StoryObj } from "@storybook/html-vite";
import { renderMarineClipPreview } from "./marine-clip-preview.js";

// Preview of the real 24-bone Titan Vanguard rig (see
// packages/client/src/client-map-3d-popup-marine/popup-marine-asset.ts's
// header once this becomes the shipped model) with its real captured
// Walking/Running/Dead animations plus real Mixamo Pistol reference poses,
// all merged into one glb and driven here through a genuine
// AnimationMixer -- no hand-tuned procedural bone math. This is a staging
// asset (packages/client/public/models/popup-marine-titan-24bone.glb, NOT
// yet wired into the shipped battle overlay) for reviewing the real clips
// before the popup-marine-* rework lands.
const MODEL_URL = "/models/popup-marine-titan-24bone.glb";
const CLIP_NAMES = ["Walking", "Running", "Dead", "PistolIdle", "PistolKneelingIdle", "PistolRun"] as const;

type Args = { color: string };

const meta: Meta<Args> = {
  title: "3D Library/PopupMarineTitanAnimationPreview",
  args: { color: "#4fb3ff" },
  render: () => renderMarineClipPreview(MODEL_URL, CLIP_NAMES, "PistolIdle")
};

export default meta;
type Story = StoryObj<Args>;
export const AnimationPreview: Story = {};
