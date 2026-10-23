import type { Meta, StoryObj } from "@storybook/html-vite";
import { renderMarineClipPreview } from "./marine-clip-preview.js";

// The Umbrite heavy trooper an empire owning an Umbrite Weapons Factory
// fields in two of its squad's slots (popup-marine-units.ts), on its own
// with every baked clip -- the standard marine's clips retargeted onto it by
// packages/client/scripts/bake-popup-marine-umbrite-model.py. In battle it
// fires from the braced kneel (PistolKneelingIdle). See
// PopupMarineSkirmish/MixedWarIndustries for it inside a real battle.
const MODEL_URL = "/models/popup-marine-umbrite-24bone.glb";
const CLIP_NAMES = ["PistolKneelingIdle", "PistolIdle", "PistolRun", "PistolWalk"] as const;

const meta: Meta = {
  title: "3D Library/PopupMarineUmbriteTrooperPreview",
  render: () => renderMarineClipPreview(MODEL_URL, CLIP_NAMES, "PistolKneelingIdle")
};

export default meta;
type Story = StoryObj;
export const AnimationPreview: Story = {};
