import type { Meta, StoryObj } from "@storybook/html-vite";
import { createRelicState, RELIC_DEFINITIONS, type NaturalWonderType } from "@border-empires/shared";
import { createRelicCaptureDialog } from "../../../client/src/client-relic-dialog/relic-capture-dialog.js";

type Args = { installation: NaturalWonderType; garrisoned: boolean; depleted: boolean };
const meta: Meta<Args> = {
  title: "Relics/Capture Dialog", parameters: { layout: "fullscreen" },
  args: { installation: "WARPRESS", garrisoned: true, depleted: false },
  argTypes: { installation: { control: "select", options: Object.keys(RELIC_DEFINITIONS) } },
  render: args => {
    const root = document.createElement("div");
    root.style.cssText = "min-height:100dvh;background:#111a1b;display:grid;place-items:center;color:#f2e8d3;font:15px system-ui";
    const button = document.createElement("button"); button.textContent = "Show capture dialog";
    const state = { ...createRelicState(args.installation), ...(args.depleted ? { remainingUses: 0 } : {}) };
    const dialog = createRelicCaptureDialog(state, args.garrisoned);
    button.onclick = () => dialog.showModal(); root.append(button, dialog);
    requestAnimationFrame(() => { if (dialog.isConnected && !dialog.open) { button.focus(); dialog.showModal(); } });
    return root;
  }
};
export default meta;
type Story = StoryObj<Args>;
export const ArmourWorks: Story = {};
export const ComputationVault: Story = { args: { installation: "CALCULATING_ENGINE" } };
export const Depleted: Story = { args: { depleted: true } };
export const AncillaryVault: Story = { args: { installation: "CONSCRIPTION_ENGINE" } };
export const ReclamationWorks: Story = { args: { installation: "FOUNDRY_HEART" } };
export const AntimatterDriveWorks: Story = { args: { installation: "DEEPWATER_ENGINE" } };
export const FieldGenerator: Story = { args: { installation: "BASTION_FRAME" } };
export const Nanofabricator: Story = { args: { installation: "QUICKFORGE" } };
export const Resonator: Story = { args: { installation: "WATCHTOWER_ENGINE" } };
export const SurveyArray: Story = { args: { installation: "CARTOGRAPHERS_LENS" } };
