import type { Tile, TileTimedProgress } from "../client-types.js";

type QueuedDevelopmentAction = {
  kind: "SETTLE" | "BUILD";
  tileKey: string;
  label: string;
  x: number;
  y: number;
};

export type DevelopmentSlotOccupant = {
  tileKey: string;
  x: number;
  y: number;
  label: string;
  remainingMs: number;
  totalMs: number;
};

export type DevelopmentPanelArgs = {
  busy: number;
  limit: number;
  activeSlots: DevelopmentSlotOccupant[];
  queue: Array<{ label: string; tileKey: string; position: number }>;
};

type StructureEntry = {
  tileKey: string;
  x: number;
  y: number;
  kind: string;
  completesAt: number | undefined;
};

const formatRemaining = (ms: number): string => {
  if (ms <= 0) return "Finishing…";
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s`;
  }
  return `${totalSec}s`;
};

const progressPct = (remainingMs: number, totalMs: number): number => {
  if (totalMs <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100)));
};

const activeStructureEntries = (tiles: Map<string, Tile>, me: string): StructureEntry[] => {
  const entries: StructureEntry[] = [];
  for (const [, tile] of tiles) {
    if (tile.ownerId !== me || tile.terrain !== "LAND" || tile.ownershipState !== "SETTLED") continue;
    const fort = tile.fort;
    if (fort && (fort.status === "under_construction" || fort.status === "removing")) {
      entries.push({ tileKey: `${tile.x},${tile.y}`, x: tile.x, y: tile.y, kind: fort.variant ?? "Fort", completesAt: fort.completesAt });
    }
    const obs = tile.observatory;
    if (obs && (obs.status === "under_construction" || obs.status === "removing")) {
      entries.push({ tileKey: `${tile.x},${tile.y}`, x: tile.x, y: tile.y, kind: "Observatory", completesAt: obs.completesAt });
    }
    const siege = tile.siegeOutpost;
    if (siege && (siege.status === "under_construction" || siege.status === "removing")) {
      entries.push({ tileKey: `${tile.x},${tile.y}`, x: tile.x, y: tile.y, kind: siege.variant ?? "Siege Outpost", completesAt: siege.completesAt });
    }
    const econ = tile.economicStructure;
    if (econ && (econ.status === "under_construction" || econ.status === "removing")) {
      entries.push({ tileKey: `${tile.x},${tile.y}`, x: tile.x, y: tile.y, kind: econ.type, completesAt: econ.completesAt });
    }
  }
  return entries;
};

export const deriveDevelopmentPanelData = (
  tiles: Map<string, Tile>,
  me: string,
  settleProgressByTile: Map<string, TileTimedProgress>,
  developmentQueue: QueuedDevelopmentAction[],
  busy: number,
  limit: number
): DevelopmentPanelArgs => {
  const now = Date.now();
  const activeSlots: DevelopmentSlotOccupant[] = [];

  for (const progress of settleProgressByTile.values()) {
    const remainingMs = Math.max(0, progress.resolvesAt - now);
    const totalMs = Math.max(1, progress.resolvesAt - progress.startAt);
    activeSlots.push({
      tileKey: `${progress.target.x},${progress.target.y}`,
      x: progress.target.x,
      y: progress.target.y,
      label: "Settlement",
      remainingMs,
      totalMs
    });
  }

  for (const entry of activeStructureEntries(tiles, me)) {
    const remainingMs = entry.completesAt ? Math.max(0, entry.completesAt - now) : 0;
    const totalMs = remainingMs > 0 ? remainingMs : 60_000;
    activeSlots.push({
      tileKey: entry.tileKey,
      x: entry.x,
      y: entry.y,
      label: entry.kind,
      remainingMs,
      totalMs
    });
  }

  const queue = developmentQueue.map((entry, i) => ({
    label: entry.label,
    tileKey: entry.tileKey,
    position: i + 1
  }));

  return { busy, limit, activeSlots, queue };
};

export const renderDevelopmentPanelHtml = (args: DevelopmentPanelArgs): string => {
  const slotsHtml = args.activeSlots.length > 0
    ? args.activeSlots.map((slot) => {
        const pct = progressPct(slot.remainingMs, slot.totalMs);
        return `<div class="economy-line"><span>${slot.label} at (${slot.x}, ${slot.y})</span><strong>${formatRemaining(slot.remainingMs)}</strong></div><div class="tile-progress-bar" style="margin-bottom:8px"><div style="width:${pct}%"></div></div>`;
      }).join("")
    : '<div class="economy-line muted"><span>No active development slots</span></div>';

  const queueHtml = args.queue.length > 0
    ? args.queue.map((item) => `<div class="economy-line"><span>#${item.position} ${item.label}</span><strong>Waiting</strong></div>`).join("")
    : '<div class="economy-line muted"><span>No queued actions</span></div>';

  return `
    <div class="economy-panel">
      <section class="card manpower-summary-card">
        <div class="economy-detail-head">
          <div>
            <div class="economy-detail-kicker">Development</div>
            <strong>${args.busy}/${args.limit} slots used</strong>
          </div>
        </div>
        <div class="economy-footnote">Development slots limit how many settles and constructions can run at once.</div>
      </section>
      <section class="card manpower-detail-card">
        <h4>Active Slots</h4>
        ${slotsHtml}
      </section>
      <section class="card manpower-detail-card">
        <h4>Waiting</h4>
        ${queueHtml}
      </section>
    </div>`;
};
