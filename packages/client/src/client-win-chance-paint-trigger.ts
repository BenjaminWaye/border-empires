import { winChanceForTile, type FrontierCombatPreviewTile } from "@border-empires/shared";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

// Workstream F0 (docs/replenishment-update-plan.md): minimal/temporary
// trigger for the win-chance map paint — the full drag-gesture (F1) doesn't
// exist yet, so this reuses the existing click-to-arm MARCH-target flow
// (client-muster-march-targeting.ts) as the "show the paint" signal. When a
// march target is actually armed (not cancelled), paint the target tile and
// its 8 neighbors so the player sees how the odds shift across nearby
// candidates too, not just the one they clicked.
//
// Kept out of client-map-3d.ts and client-action-flow.ts (both already well
// over the repo's 500-line file cap) as its own module — only a single call
// site is added to each, appended onto an existing line rather than a new
// one, so neither file's line count grows (AGENTS.md file-line cap).

const NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
];

const WIN_CHANCE_PAINT_DURATION_MS = 6000;

const previewTileFor = (tile: Tile | undefined): FrontierCombatPreviewTile => ({
  terrain: tile?.terrain,
  ownershipState: tile?.ownershipState ?? undefined,
  dockId: tile?.dockId,
  townType: tile?.townType,
  fortVariant: tile?.fort?.status === "active" ? tile.fort.variant : undefined
});

/**
 * Computes and stashes state.winChancePaint for the target tile + its 8
 * neighbors when a MARCH target is armed. No-op when targeting was
 * cancelled (targetX/targetY undefined) — the caller passes the same
 * (wx, wy, vis) it just fed handleMusterMarchTargetClick, and this re-derives
 * "was this actually armed" the same way that function does, rather than
 * duplicating its cancel logic.
 */
export const triggerWinChancePaintOnMarchArm = (
  state: Pick<ClientState, "tiles" | "winChancePaint">,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  vis: "visible" | "fogged" | "unexplored",
  keyFor: (x: number, y: number) => string,
  nowMs: number
): void => {
  if (vis === "unexplored" || (targetX === originX && targetY === originY)) return;
  const entries: { x: number; y: number; winChance: number; color: string }[] = [];
  const offsets: ReadonlyArray<[number, number]> = [[0, 0], ...NEIGHBOR_OFFSETS];
  for (const [dx, dy] of offsets) {
    const x = targetX + dx, y = targetY + dy;
    const tile = state.tiles.get(keyFor(x, y));
    const { winChance, color } = winChanceForTile(previewTileFor(tile));
    entries.push({ x, y, winChance, color });
  }
  state.winChancePaint = { targetX, targetY, expiresAt: nowMs + WIN_CHANCE_PAINT_DURATION_MS, entries };
  // eslint-disable-next-line no-console
  console.log("[F0 win-chance-paint] armed", { targetX, targetY, entries });
};
