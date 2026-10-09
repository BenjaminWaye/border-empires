import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import "@client/client-steampunk-stat-chips-style.css";
import { DEFAULT_HUD_CHIPS_ARGS, manpowerChip, type HudChipsArgs } from "./hud/hud-stat-chips-fixture.js";

/**
 * Every state of the HUD manpower gauge (client-manpower-gauge.ts), rendered
 * with the real chip builder and stylesheet at desktop layout. Mobile layout is
 * covered by the "Stat Chips" stories at a phone viewport.
 */
type GalleryCase = { title: string; note: string; args: Partial<HudChipsArgs> };

const GALLERY: GalleryCase[] = [
  { title: "Mid pool", note: "Brass fill, countdown to the next refill.", args: {} },
  { title: "Just refilled", note: "Window restarted: the countdown shows the full 4h.", args: { manpower: 508, minutesIntoWindow: 0 } },
  { title: "Below attack cost", note: "Fill turns ember under 60 so 'can't attack' reads without the number.", args: { manpower: 42, minutesIntoWindow: 200 } },
  { title: "Empty", note: "Empty tube; the countdown says when it comes back.", args: { manpower: 0, minutesIntoWindow: 30 } },
  { title: "Muster flags staged", note: "Copper plating = manpower already pulled into flags; explains why the pool dropped.", args: { manpower: 210, staged: 180, minutesIntoWindow: 90 } },
  { title: "Full", note: "Verdigris fill; the countdown is replaced by 'Full'.", args: { manpower: 720 } },
  { title: "Waystation overflow", note: "Above the cap: bright brass shimmer. Regen is paused until spent back under.", args: { manpower: 1_200 } },
  { title: "Regen paused", note: "Titanium Levy's regen freeze: no countdown to show.", args: { regenPerMinute: 0 } },
  { title: "Late game", note: "Big cap: same gauge.", args: { manpower: 2_140, manpowerCap: 4_350, minutesIntoWindow: 75 } }
];

const render = (): HTMLElement => {
  const root = document.createElement("div");
  root.style.cssText =
    "min-height:100vh;box-sizing:border-box;padding:32px 28px;font-family:var(--sp-font-body);color:var(--sp-parchment-100);" +
    "background:radial-gradient(circle at 50% 0,var(--sp-iron-850) 0%,var(--sp-iron-950) 70%);";
  const caseStyle = "display:grid;gap:7px;align-content:start;";
  const titleStyle = "margin:0;font-family:var(--sp-font-display);font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--sp-brass-100);";
  const noteStyle = "margin:0;font-size:12px;line-height:1.45;color:var(--sp-parchment-muted);";
  // The chip stylesheet is scoped under #stats-chips, so the gallery is one such container.
  root.innerHTML = `<div id="stats-chips" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px;align-items:start;">
    ${GALLERY.map(
      (item) => `<div style="${caseStyle}"><h3 style="${titleStyle}">${item.title}</h3>${manpowerChip({ ...DEFAULT_HUD_CHIPS_ARGS, ...item.args })}<p style="${noteStyle}">${item.note}</p></div>`
    ).join("")}
  </div>`;
  return root;
};

const meta: Meta = {
  title: "UI/HUD/Manpower Gauge",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  render
};

export default meta;
export const AllStates: StoryObj = {};
