import type { Meta, StoryObj } from "@storybook/html-vite";
import "@client/style.css";
import "@client/client-dev-queue-state-style.css";
import { tileActionMenuHtml } from "@client/client-tile-menu-html.js";
import { queuedSettlementProgressForTile } from "@client/client-tile-menu-queue-progress/client-tile-menu-queue-progress.js";
import type { Tile, TileMenuView } from "@client/client-types.js";
import { DEV_QUEUE_SERVER_CAP } from "@border-empires/shared";

/**
 * Renders the *real* implementation: client-tile-menu-queue-progress.ts +
 * client-tile-menu-html.ts + client-dev-queue-state-style.css. This is no
 * longer a CSS mockup -- the classes/badges/copy here are the shipped code.
 */
const tile = { x: 212, y: 88, terrain: "LAND", ownershipState: "UNCLAIMED" } as unknown as Tile;

const baseView = (progress: ReturnType<typeof queuedSettlementProgressForTile>): TileMenuView => ({
  title: `Frontier Tile (${tile.x}, ${tile.y})`,
  subtitle: "Unclaimed frontier",
  tabs: ["progress", "overview"],
  overviewLines: [],
  actions: [],
  buildings: [],
  crystal: [],
  ...(progress ? { progress } : {})
});

const plannedProgress = queuedSettlementProgressForTile(tile, {
  keyFor: (x, y) => `${x},${y}`,
  queuedDevelopmentEntryForTile: () => ({ kind: "SETTLE", tileKey: "212,88" }),
  queuedSettlementIndexForTile: () => 2,
  queuedEntryIndexForTile: () => 12,
  devQueueStateForTile: () => "planned"
});

const queuedProgress = queuedSettlementProgressForTile(tile, {
  keyFor: (x, y) => `${x},${y}`,
  queuedDevelopmentEntryForTile: () => ({ kind: "SETTLE", tileKey: "212,88" }),
  queuedSettlementIndexForTile: () => 1,
  queuedEntryIndexForTile: () => 1,
  devQueueStateForTile: () => "queued"
});

const plannedAfterFullQueue = queuedSettlementProgressForTile(tile, {
  keyFor: (x, y) => `${x},${y}`,
  queuedDevelopmentEntryForTile: () => ({ kind: "SETTLE", tileKey: "212,88" }),
  queuedSettlementIndexForTile: () => 0,
  queuedEntryIndexForTile: () => DEV_QUEUE_SERVER_CAP,
  devQueueStateForTile: () => "planned"
});

const activeView: TileMenuView = {
  title: "Frontier Tile (212, 88)",
  subtitle: "Unclaimed frontier",
  tabs: ["progress", "overview"],
  overviewLines: [],
  actions: [],
  buildings: [],
  crystal: [],
  progress: {
    title: "Settlement in progress",
    detail: "This tile is actively settling right now.",
    remainingLabel: "0:38",
    progress: 0.62,
    note: "This settlement will complete automatically.",
    cancelLabel: "Cancel settlement",
    queueState: "active"
  }
};

const columns: { label: string; description: string; view: TileMenuView }[] = [
  {
    label: "1. Planned (client-local)",
    description:
      "Uncapped wishlist. Dashed border + hatched progress bar signal it is not yet real -- it can vanish if the tab closes before it's submitted to the server.",
    view: baseView(plannedProgress)
  },
  {
    label: "2. Queued (server-confirmed)",
    description: `Solid border + green check badge signal durability: capped at ${DEV_QUEUE_SERVER_CAP}/player (DEV_QUEUE_SERVER_CAP), persisted server-side, survives logout/restart.`,
    view: baseView(queuedProgress)
  },
  {
    label: `3. Planned #1, after Queued #${DEV_QUEUE_SERVER_CAP}`,
    description: `The server queue is full (${DEV_QUEUE_SERVER_CAP}/${DEV_QUEUE_SERVER_CAP}), so this tile sits in Planned instead. Pressing "Jump to front of queue" here forces it straight into Queue #1 -- and bumps whichever tile is currently Queue #${DEV_QUEUE_SERVER_CAP} back to the front of Planned, so the cap never breaks.`,
    view: baseView(plannedAfterFullQueue)
  },
  {
    label: "4. Active (for reference)",
    description: "Existing in-progress card, unmodified, shown for comparison against the Planned/Queued states above.",
    view: activeView
  }
];

const render = (): HTMLElement => {
  const container = document.createElement("div");

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 330px))";
  row.style.gap = "22px";
  row.style.padding = "28px";
  row.style.fontFamily = "system-ui, sans-serif";

  for (const col of columns) {
    const colEl = document.createElement("div");
    colEl.style.display = "grid";
    colEl.style.gap = "10px";

    const heading = document.createElement("h3");
    heading.style.margin = "0";
    heading.style.color = "#ffd166";
    heading.style.fontSize = "13px";
    heading.style.fontWeight = "800";
    heading.style.textTransform = "uppercase";
    heading.style.letterSpacing = "0.06em";
    heading.textContent = col.label;
    colEl.appendChild(heading);

    const desc = document.createElement("p");
    desc.style.margin = "0 0 4px 0";
    desc.style.color = "rgba(201, 216, 236, 0.72)";
    desc.style.fontSize = "12px";
    desc.style.lineHeight = "1.5";
    desc.textContent = col.description;
    colEl.appendChild(desc);

    const menuWrap = document.createElement("div");
    menuWrap.style.position = "relative";
    menuWrap.style.width = "330px";
    menuWrap.innerHTML = tileActionMenuHtml(col.view, "progress", false);
    colEl.appendChild(menuWrap);

    row.appendChild(colEl);
  }

  container.appendChild(row);
  return container;
};

const meta: Meta = {
  title: "UI/Development Queue States",
  parameters: {
    docs: {
      description: {
        component:
          "Real implementation (client-tile-menu-queue-progress.ts + client-dev-queue-state-style.css) distinguishing client-local Planned actions from server-confirmed, capped (DEV_QUEUE_SERVER_CAP) Queued actions. See packages/shared/src/dev-queue/dev-queue.ts for the underlying cap/promotion/move-to-front algorithm."
      }
    }
  },
  render
};

export default meta;
type Story = StoryObj;

export const AllStates: Story = {};
