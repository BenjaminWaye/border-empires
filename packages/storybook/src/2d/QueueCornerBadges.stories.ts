import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawQueuedCornerBadge, queuedCornerBadgeLayout, type QueuedCornerBadgeEntryState, type QueuedCornerBadgeKind } from "@client/client-queue-badges/client-queue-badges.js";
import { DEV_QUEUE_CLIENT_CAP, DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";

type Args = {
  tileSize: number;
  isTrue3D: boolean;
};

const BACKGROUND = "#0a0e14";
const TILE_FILL = "#1c2a3a";
const TILE_BORDER = "rgba(255, 255, 255, 0.08)";

const KINDS: { kind: QueuedCornerBadgeKind; ordinal: number; entryState: QueuedCornerBadgeEntryState; label: string }[] = [
  { kind: "SETTLEMENT", ordinal: 1, entryState: "queued", label: "Queued settlement -- server-confirmed, next up" },
  { kind: "SETTLEMENT", ordinal: 1, entryState: "planned", label: `Planned settlement #1 -- server queue is full at ${DEV_QUEUE_SERVER_CAP}/${DEV_QUEUE_SERVER_CAP}` },
  { kind: "FRONTIER", ordinal: 3, entryState: "queued", label: "Queued frontier claim" },
  { kind: "BUILD", ordinal: 12, entryState: "planned", label: "Planned build (double-digit ordinal, client-local)" }
];

const render = (args: Args): HTMLElement => {
  const root = document.createElement("div");
  root.style.padding = "20px";
  root.style.background = BACKGROUND;
  root.style.color = "#cbd5e1";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.minHeight = "100vh";

  const header = document.createElement("div");
  header.style.marginBottom = "16px";
  header.style.fontSize = "13px";
  header.style.opacity = "0.75";
  header.style.maxWidth = "680px";
  header.style.lineHeight = "1.5";
  header.textContent =
    `Real map-level overlay (client-queue-badges.ts), drawn directly on a tile via the 2D canvas render loop -- distinct from the tile-action-menu progress card. entryState='queued' (server-confirmed, capped at ${DEV_QUEUE_SERVER_CAP}, durable) renders a solid border and full-opacity badge; entryState='planned' (client-local wishlist, capped at ${DEV_QUEUE_CLIENT_CAP}) renders a dashed border and a muted badge to signal it's not yet real.`;
  root.appendChild(header);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "28px";
  row.style.flexWrap = "wrap";

  for (const entry of KINDS) {
    const col = document.createElement("div");
    col.style.display = "grid";
    col.style.gap = "8px";
    col.style.justifyItems = "center";

    const canvas = document.createElement("canvas");
    canvas.width = args.tileSize + 20;
    canvas.height = args.tileSize + 20;
    canvas.style.display = "block";
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const px = 10;
    const py = 10;
    ctx.fillStyle = TILE_FILL;
    ctx.fillRect(px, py, args.tileSize, args.tileSize);
    ctx.strokeStyle = TILE_BORDER;
    ctx.strokeRect(px, py, args.tileSize, args.tileSize);

    const layout = queuedCornerBadgeLayout({
      kind: entry.kind,
      ordinal: entry.ordinal,
      px,
      py,
      size: args.tileSize,
      isTrue3D: args.isTrue3D,
      blocked: false,
      entryState: entry.entryState
    });
    drawQueuedCornerBadge(ctx, layout);

    const caption = document.createElement("div");
    caption.style.fontSize = "12px";
    caption.style.textAlign = "center";
    caption.style.maxWidth = `${args.tileSize + 20}px`;
    caption.style.color = "rgba(203, 213, 225, 0.85)";
    caption.textContent = entry.label;

    col.appendChild(canvas);
    col.appendChild(caption);
    row.appendChild(col);
  }

  root.appendChild(row);
  return root;
};

const meta: Meta<Args> = {
  title: "2D/Queue Corner Badges",
  parameters: {
    docs: {
      description: {
        component:
          "Map-tile overlay showing queue position for SETTLEMENT (amber), FRONTIER (purple), and BUILD (cyan) queue entries, in both 'queued' (server-confirmed, solid) and 'planned' (client-local, dashed/muted) entry states. Rendered by client-queue-badges.ts and wired into client-runtime-loop.ts."
      }
    }
  },
  argTypes: {
    tileSize: { control: { type: "range", min: 24, max: 96, step: 2 } },
    isTrue3D: { control: "boolean" }
  },
  args: { tileSize: 56, isTrue3D: false },
  render
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};
export const LargeTiles: Story = { args: { tileSize: 84 } };
export const True3DMode: Story = { args: { isTrue3D: true } };
