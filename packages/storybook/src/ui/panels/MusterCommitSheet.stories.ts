import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-steampunk-theme-style.css";
import "@client/client-effort-confirm-sheet/client-effort-confirm-sheet-style.css";
import { hideEffortConfirmSheet, showEffortConfirmSheet } from "@client/client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { drawMusterProgressBadge, musterBadgeRadius2D } from "@client/client-muster-flag-badge/client-muster-flag-badge.js";

/**
 * The "commit manpower" sheet shared by March To, Launch Attack and Expand To
 * & Attack (client-effort-confirm-sheet.ts), in the steampunk theme, beside
 * the 2D muster flag badge (client-muster-flag-badge.ts) at a few fill
 * levels and tile sizes, attack (brass) above capacity (verdigris) -- the 2D
 * map has no banner, so the badge sits over the flag's tile.
 */
type Args = { mode: "slider" | "presets"; floor: number; cap: number };

const render = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.cssText =
    "min-height:100vh;box-sizing:border-box;padding:32px 28px;font-family:var(--sp-font-body);color:var(--sp-parchment-100);" +
    "background:radial-gradient(circle at 50% 0,var(--sp-iron-850) 0%,var(--sp-iron-950) 70%);";
  const heading = document.createElement("h3");
  heading.textContent = "2D flag badges: attack rows 24 / 36 / 48 px, then capacity at 36 px";
  heading.style.cssText = "margin:0 0 12px;font-family:var(--sp-font-display);font-size:13px;color:var(--sp-brass-100);";
  const canvas = document.createElement("canvas");
  canvas.width = 560;
  canvas.height = 340;
  canvas.style.cssText = "display:block;background:#1d2a17;border:1px solid var(--sp-brass-700);border-radius:6px;";
  root.append(heading, canvas);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const ratios = [0, 0.18, 0.5, 0.83, 0.99];
    ([[24, "attack"], [36, "attack"], [48, "attack"], [36, "capacity"]] as const).forEach(([size, kind], row) => {
      ratios.forEach((ratio, col) => {
        const sx = 60 + col * 105;
        const sy = 60 + row * 80;
        ctx.fillStyle = "rgba(58, 123, 213, 0.45)";
        ctx.fillRect(sx - size / 2, sy - size / 2 + 16, size, size);
        const radius = musterBadgeRadius2D(size);
        drawMusterProgressBadge(ctx, sx, sy + 16 - size * 0.15 - radius * 1.45, radius, ratio, kind);
      });
    });
  }
  // Re-open on every render so control changes show up immediately.
  queueMicrotask(() =>
    showEffortConfirmSheet({
      title: args.mode === "slider" ? "Commit march to (412, 87)" : "Attack connected region",
      subtitle: args.mode === "slider" ? "Garrisoned tile — committing more manpower improves your odds." : "3 defended targets — effort applies to each of them.",
      floor: args.floor,
      cap: args.cap,
      mode: args.mode,
      confirmLabel: args.mode === "slider" ? "Go" : "Attack",
      describe: (commit) => `Win chance ${Math.min(95, Math.round(38 + (commit / args.floor - 1) * 14))}% · costs ${commit} manpower`,
      onConfirm: () => undefined
    })
  );
  return root;
};

const meta: Meta<Args> = {
  title: "UI/Panels/Muster Commit Sheet",
  argTypes: {
    mode: { control: "inline-radio", options: ["slider", "presets"] },
    floor: { control: { type: "number", min: 1 } },
    cap: { control: { type: "number", min: 1 } }
  },
  args: { mode: "slider", floor: 150, cap: 1_850 },
  render,
  beforeEach: () => () => hideEffortConfirmSheet()
};

export default meta;

type Story = StoryObj<Args>;

export const Slider: Story = {};
export const PresetsOnly: Story = { args: { mode: "presets", floor: 60 } };
