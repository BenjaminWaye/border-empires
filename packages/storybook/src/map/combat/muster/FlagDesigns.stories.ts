import type { Meta, StoryObj } from "@storybook/html-vite";
import type { MusterFlagDesign } from "@client/client-cosmetics/client-cosmetics.js";
import { createBuildingEnvironmentTexture } from "@client/client-map-3d-atmosphere.js";
import { createMusterOverlay } from "@client/client-map-3d-muster-overlay.js";
import { drawMusterSiegeBadge } from "@client/client-map-render/client-map-render-muster-siege-badge.js";
import { createGrassGround, createStage, wrapWithCleanup } from "../../../fixtures/three-stage.js";

type Args = {
  cameraDistance: number;
  advance: boolean;
  fillRatio: number;
};

const EMPIRE_COLORS = ["#d23c3c", "#3a7bd5", "#e0b030", "#46a35a", "#9b59b6"];
const DESIGNS: MusterFlagDesign[] = ["default", "flag-high-noble"];
const DESIGN_LABELS: Record<MusterFlagDesign, string> = { default: "Standard", "flag-high-noble": "High-noble standard" };

const render3D = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.85, background: "#12210f" });
  const ground = createGrassGround(4);
  stage.scene.add(ground.group);
  const envMap = createBuildingEnvironmentTexture(stage.renderer); // what the gilding reflects in the game
  const overlay = createMusterOverlay(stage.scene, envMap);
  DESIGNS.forEach((design, row) => {
    EMPIRE_COLORS.forEach((color, i) => {
      const x = (i - (EMPIRE_COLORS.length - 1) / 2) * 1.1;
      // Back row: the standard flag. Front row: the same owners with the cosmetic.
      overlay.addMuster(x, row === 0 ? -1 : 1, 0, args.fillRatio, color, args.advance, i, row, 0, design);
    });
  });
  overlay.commit();
  let rafId = 0;
  const animate = (): void => {
    overlay.tick(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return wrapWithCleanup(stage, [ground.dispose, overlay.dispose, () => cancelAnimationFrame(rafId), () => envMap.dispose()]);
};

// The 2D map draws a muster flag only as the pennant of your own besieged
// flag (client-map-render-muster-siege-badge.ts), so that is the 2D half.
const render2D = (): HTMLElement => {
  const tile = 96;
  const root = document.createElement("div");
  root.style.cssText = "display:grid;gap:12px;padding:16px;background:#12210f;color:#e9f2ff;font:13px system-ui;width:max-content;";
  for (const design of DESIGNS) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;";
    const label = document.createElement("span");
    label.textContent = DESIGN_LABELS[design];
    label.style.width = "130px";
    row.appendChild(label);
    const canvas = document.createElement("canvas");
    canvas.width = tile * EMPIRE_COLORS.length;
    canvas.height = tile;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      EMPIRE_COLORS.forEach((color, i) => {
        ctx.fillStyle = i % 2 === 0 ? "#3d6b34" : "#35602d";
        ctx.fillRect(i * tile, 0, tile, tile);
        drawMusterSiegeBadge(ctx, i * tile, 0, tile, color, 225, design);
      });
    }
    row.appendChild(canvas);
    root.appendChild(row);
  }
  return root;
};

const meta: Meta<Args> = {
  title: "Map/Combat/Muster/Flag Designs",
  parameters: {
    docs: {
      description: {
        component: [
          "Muster flag cosmetics (docs/cosmetics.md). Back row: the standard flag every account has. Front row: the same five",
          "Houses showing the High-noble standard: a turning aureole of gold rays inside a counter-turning halo, gilded wings,",
          "double swallow-tailed House streamers, chained gold posts with glowing gems, a sheen and glints on the gilding,",
          "gold dust drifting up, and a gold-bordered damask cloth with a sun in splendour in metallic gold thread.",
          "The cloth's outline, the owner's colour as the field, the brighter and faster ADVANCE banner and the soldier",
          "count are identical, so a rival reads owner, mode and strength exactly as from the standard flag.",
          "The 2D map has no banner; its only muster flag is the pennant on your own besieged flag (Pennant2D)."
        ].join("\n")
      }
    }
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1.5, max: 12, step: 0.5 } },
    advance: { control: "boolean" },
    fillRatio: { control: { type: "range", min: 0, max: 1, step: 0.05 } }
  },
  args: { cameraDistance: 5, advance: false, fillRatio: 0.6 },
  render: render3D
};

export default meta;

type Story = StoryObj<Args>;

export const SideBySide: Story = {};
export const CloseUp: Story = { args: { cameraDistance: 3.4 } };
export const Advance: Story = { args: { advance: true, fillRatio: 1 } };
export const MapDistance: Story = { args: { cameraDistance: 9 } };
export const Pennant2D: Story = { render: render2D };
