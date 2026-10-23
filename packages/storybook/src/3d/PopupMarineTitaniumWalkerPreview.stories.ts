import type { Meta, StoryObj } from "@storybook/html-vite";
import { renderMarineClipPreview } from "./marine-clip-preview.js";

// The titanium war-walker squads of an empire owning a Titanium Weapons
// Factory field instead of standard marines (popup-marine-armor.ts), on its
// own with every baked clip. Built by
// packages/client/scripts/bake-popup-marine-titanium-model.py; its clips are
// exported under the standard marine's slot names, so the buttons read:
//   PistolRun          heavy advance (battle approach / rout)
//   PistolIdle         braced combat idle (standing firefight)
//   PistolKneelingIdle same braced idle -- a walker doesn't kneel
//   PistolWalk         muster-transit march
//   MeleeSwing         close-combat swing, not played by the game yet
// See PopupMarineSkirmish/TitaniumVsStandard for it inside a real battle.
const MODEL_URL = "/models/popup-marine-titanium-24bone.glb";
const CLIP_NAMES = ["PistolRun", "PistolIdle", "PistolKneelingIdle", "PistolWalk", "MeleeSwing"] as const;

const meta: Meta = {
  title: "3D Library/PopupMarineTitaniumWalkerPreview",
  render: () => renderMarineClipPreview(MODEL_URL, CLIP_NAMES, "PistolRun")
};

export default meta;
type Story = StoryObj;
export const AnimationPreview: Story = {};
