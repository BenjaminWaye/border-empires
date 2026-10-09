import type { Meta, StoryObj } from "@storybook/html-vite";
import { DEFAULT_HUD_CHIPS_ARGS, isMobileViewport, topStripHtml, type HudChipsArgs } from "./hud-stat-chips-fixture.js";

/**
 * The real top HUD strip with the steampunk stat chips: the manpower gauge
 * (available / staged manpower, countdown to the next 4h refill), the
 * Development gear train, and the brass-and-leather Player/Coin/Integrity
 * chips. Desktop vs mobile follows the client's `max-width: 900px` media
 * query; the chip markup is picked at render time like client-hud.ts, so
 * re-render the story after switching the viewport toolbar.
 */
const render = (args: HudChipsArgs): HTMLElement => {
  const mobile = isMobileViewport();
  const root = document.createElement("div");
  root.style.cssText =
    "min-height:100vh;box-sizing:border-box;padding:12px 0;" +
    "background:radial-gradient(circle at 50% 0,#322414,#100c07 55%,#080604);font-family:var(--sp-font-body,serif);";
  root.innerHTML = `<div style="padding:0 ${mobile ? 6 : 10}px;">${topStripHtml(args, mobile)}</div>`;
  return root;
};

const MOBILE = { globals: { viewport: { value: "mobile1", isRotated: false } } };

const meta: Meta<HudChipsArgs> = {
  title: "UI/HUD/Stat Chips",
  parameters: { layout: "fullscreen" },
  argTypes: {
    manpower: { control: { type: "range", min: 0, max: 1500, step: 1 } },
    manpowerCap: { control: { type: "range", min: 60, max: 2000, step: 10 } },
    staged: { control: { type: "range", min: 0, max: 500, step: 1 } },
    regenPerMinute: { control: { type: "range", min: 0, max: 8, step: 0.05 } },
    minutesIntoWindow: { control: { type: "range", min: 0, max: 240, step: 5 } },
    devBusy: { control: { type: "range", min: 0, max: 8, step: 1 } },
    devLimit: { control: { type: "range", min: 1, max: 9, step: 1 } },
    warnings: { control: "boolean" }
  },
  args: DEFAULT_HUD_CHIPS_ARGS,
  render
};

export default meta;
type Story = StoryObj<HudChipsArgs>;

export const Desktop: Story = {};
export const Mobile: Story = { ...MOBILE };
export const MobileWithMuster: Story = { args: { manpower: 210, staged: 180 }, ...MOBILE };
export const DesktopWarnings: Story = { args: { warnings: true, manpower: 42 } };
export const MobileWarnings: Story = { args: { warnings: true, manpower: 42 }, ...MOBILE };
export const DesktopSixDevSlots: Story = { args: { devBusy: 4, devLimit: 6 } };
export const MobileSixDevSlots: Story = { args: { devBusy: 4, devLimit: 6 }, ...MOBILE };
