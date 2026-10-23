import type { Meta, StoryObj } from "@storybook/html-vite";
import { renderMarineClipPreview } from "./marine-clip-preview.js";

// The titanium war-walker an empire owning a Titanium Weapons Factory
// fields in two of its squad's slots (popup-marine-units.ts), on its own
// with every baked clip. Built by
// packages/client/scripts/bake-popup-marine-titanium-model.py; its clips are
// exported under the standard marine's slot names, so the buttons read:
//   PistolRun          heavy advance (battle approach / rout)
//   PistolIdle         braced combat idle (standing firefight)
//   PistolKneelingIdle same braced idle -- a walker doesn't kneel
//   PistolWalk         muster-transit march
//   MeleeSwing         close combat, played by the assault walker's charge
// See PopupMarineSkirmish/TitaniumSquadVsInfantry for it inside a real battle.
const MODEL_URL = "/models/popup-marine-titanium-24bone.glb";
const CLIP_NAMES = ["PistolRun", "PistolIdle", "PistolKneelingIdle", "PistolWalk", "MeleeSwing"] as const;

const meta: Meta = {
  title: "3D Library/PopupMarineTitaniumWalkerPreview",
  render: () => renderMarineClipPreview(MODEL_URL, CLIP_NAMES, "PistolRun")
};

export default meta;
type Story = StoryObj;
export const AnimationPreview: Story = {};
