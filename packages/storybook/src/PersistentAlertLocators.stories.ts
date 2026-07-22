import type { Meta, StoryObj } from "@storybook/html-vite";

type Args = { width: number; height: number };

const drawCrossedSwordsGlyph = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.5, size * 0.16);
  ctx.lineCap = "round";
  for (const flip of [1, -1]) {
    ctx.save();
    ctx.scale(flip, 1);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = Math.max(3, size * 0.3);
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(size * 0.55, size * 0.55);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(-size * 0.3, -size * 0.55);
    ctx.lineTo(-size * 0.55, -size * 0.3);
    ctx.closePath();
    ctx.stroke();
    ctx.save();
    ctx.translate(-size * 0.42, -size * 0.42);
    ctx.rotate(-Math.PI / 4);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
    ctx.lineWidth = Math.max(2.5, size * 0.25);
    ctx.beginPath();
    ctx.moveTo(-size * 0.16, 0);
    ctx.lineTo(size * 0.16, 0);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  ctx.strokeStyle = "#fff7d1";
  ctx.fillStyle = "#fff7d1";
  ctx.lineWidth = Math.max(1.5, size * 0.16);
  for (const flip of [1, -1]) {
    ctx.save();
    ctx.scale(flip, 1);
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(size * 0.55, size * 0.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.55, -size * 0.55);
    ctx.lineTo(-size * 0.3, -size * 0.55);
    ctx.lineTo(-size * 0.55, -size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(-size * 0.42, -size * 0.42);
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-size * 0.16, 0);
    ctx.lineTo(size * 0.16, 0);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
};

const drawBadge = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, glyph: "swords" | "exclaim", angle: number = 0): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.85 + Math.sin(Date.now() / 260) * 0.15;
  ctx.fillStyle = "rgba(17, 23, 34, 0.92)";
  ctx.strokeStyle = "rgba(255, 209, 102, 0.92)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(angle);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.moveTo(radius * 0.6, 0);
  ctx.lineTo(-radius * 0.35, -radius * 0.5);
  ctx.lineTo(-radius * 0.15, 0);
  ctx.lineTo(-radius * 0.35, radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-angle);
  if (glyph === "swords") {
    drawCrossedSwordsGlyph(ctx, 0, 0, radius * 0.55);
  } else {
    ctx.font = `bold ${radius * 1.2}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillText("!", 0, radius * 0.08);
    ctx.fillStyle = "#fff7d1";
    ctx.fillText("!", 0, radius * 0.04);
  }
  ctx.restore();
};

const render = (args: Args): HTMLElement => {
  const canvas = document.createElement("canvas");
  canvas.width = args.width;
  canvas.height = args.height;
  canvas.style.background = "#2a2a3a";
  canvas.style.display = "block";

  const ctx = canvas.getContext("2d")!;

  const badgeRadius = 35;
  const badges = [
    { x: 100, y: 100, angle: -Math.PI / 4, glyph: "swords" as const },
    { x: args.width - 100, y: 80, angle: Math.PI / 6, glyph: "swords" as const },
    { x: 80, y: args.height - 80, angle: 0, glyph: "exclaim" as const },
    { x: args.width - 80, y: args.height - 100, angle: -Math.PI / 3, glyph: "exclaim" as const }
  ];

  for (const badge of badges) {
    drawBadge(ctx, badge.x, badge.y, badgeRadius, badge.glyph, badge.angle);
  }

  const container = document.createElement("div");
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.padding = "1rem";
  container.style.background = "#1a1a24";
  container.style.color = "#ccc";
  container.style.maxWidth = "900px";

  const legend = document.createElement("div");
  legend.style.marginTop = "1.5rem";
  legend.style.fontSize = "0.875rem";
  legend.style.lineHeight = "1.6";
  legend.innerHTML = `
    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">Persistent Alert Locators</h3>
    <p style="margin: 0 0 0.75rem 0;">
      <strong style="color: #ffd166;">⚔️ Crossed swords</strong> = Active muster flag<br/>
      <strong style="color: #ffd166;">!</strong> = Unfed town alert
    </p>
    <p style="margin: 0; color: #999; font-size: 0.8rem;">
      The badges pulse and rotate to point at off-screen targets. The arrows above are fixed pointers; in gameplay they rotate toward their targets.
    </p>
  `;

  container.appendChild(canvas);
  container.appendChild(legend);
  return container;
};

const meta: Meta<Args> = {
  title: "HUD/Persistent Alert Locators",
  argTypes: {
    width: { control: { type: "number", min: 400, max: 1200, step: 50 } },
    height: { control: { type: "number", min: 300, max: 800, step: 50 } }
  },
  args: { width: 800, height: 400 },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};
export const Wide: Story = { args: { width: 1000, height: 400 } };
export const Tall: Story = { args: { width: 500, height: 600 } };
