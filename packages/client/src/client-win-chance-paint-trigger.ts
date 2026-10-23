import { findKnownShieldAmount, winChanceForTile, type FrontierCombatPreviewTile } from "@border-empires/shared";
import { collectKnownShieldFlags } from "./client-known-shield-flags.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

// Workstream F0 (docs/replenishment-update-plan.md): trigger for the
// win-chance map paint. Originally painted the armed target tile + its 8
// neighbors as tinted squares; per later design feedback this now instead
// labels every ENEMY-owned tile the arrow actually crosses (origin ->
// target, Bresenham) with its win-chance percentage, so the player reads
// odds along the whole line, not just at the tip. Called once when the
// March-To target is clicked (client-arrow-gesture-confirm.ts) and again on
// every confirm-sheet slider/preset change (client-arrow-gesture-confirm-
// sheet.ts), passing the currently chosen commitManpower, so the labels are
// slider-live rather than frozen at the target's base cost.
//
// Kept out of client-map-3d.ts and client-action-flow.ts (both already well
// over the repo's 500-line file cap) as its own module — only a single call
// site is added to each, appended onto an existing line rather than a new
// one, so neither file's line count grows (AGENTS.md file-line cap).

const WIN_CHANCE_PAINT_DURATION_MS = 6000;
const MAX_WIN_CHANCE_LABELS = 20;

const previewTileFor = (tile: Tile | undefined): FrontierCombatPreviewTile => ({
  terrain: tile?.terrain,
  ownershipState: tile?.ownershipState ?? undefined,
  dockId: tile?.dockId,
  townType: tile?.townType,
  fortVariant: tile?.fort?.status === "active" ? tile.fort.variant : undefined,
  // A freshly captured FRONTIER tile still holding ground defends (capture-hold).
  captureHoldUntil: tile?.captureHoldUntil
});

/**
 * Bresenham's line algorithm over integer tile coordinates, inclusive of
 * both endpoints — the exact set of tiles the straight attack arrow (see
 * client-map-3d-arrow-overlay.ts / the 2D equivalent) visually crosses on
 * its way from origin to target.
 */
export const tilesAlongLine = (x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] => {
  const points: { x: number; y: number }[] = [];
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return points;
};

/**
 * Computes and stashes state.winChancePaint: a "XX%" label for every
 * enemy-owned tile the origin->target line crosses (the player's own origin
 * tile is never labeled). No-op when vis is "unexplored" (nothing known to
 * label) or origin===target.
 *
 * `commit`, when passed, scores every label against that chosen
 * commitManpower over the target tile's own base muster cost (the confirm
 * sheet's slider-live recompute) instead of each tile's own "just enough"
 * default (commit === base, i.e. no boost/penalty) used when omitted.
 */
/**
 * Client-side win-chance estimate for one enemy tile (the same math as the
 * march arrow's labels) -- the fallback when no server ATTACK_PREVIEW for it
 * is cached yet.
 */
export const estimateTileWinChance = (
  state: Pick<ClientState, "tiles">,
  tile: Tile,
  commit: { committedManpower: number; baseMusterCost: number }
): number =>
  winChanceForTile(previewTileFor(tile), {
    knownShieldAmount: tile.ownerId ? findKnownShieldAmount(tile.x, tile.y, tile.ownerId, collectKnownShieldFlags(state.tiles.values())) : 0,
    modifiers: { nowMs: Date.now() },
    committedManpower: commit.committedManpower,
    baseMusterCost: commit.baseMusterCost
  }).winChance;

type WinChanceEntry = { x: number; y: number; winChance: number; color: string };

/**
 * The "XX%" label data for every enemy-owned tile the origin->target line
 * crosses (never the player's own origin tile), scored against `commit` when
 * passed -- see triggerWinChancePaintOnMarchArm. Pure: shared by the map
 * paint and the March To sheet's live win-chance line.
 */
export const winChanceEntriesAlongLine = (
  state: Pick<ClientState, "tiles" | "me">,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  keyFor: (x: number, y: number) => string,
  commit?: { committedManpower: number; baseMusterCost: number }
): WinChanceEntry[] => {
  const entries: WinChanceEntry[] = [];
  // F3: the same client-known shield flags the shield-area overlay uses
  // (client-known-shield-flags.ts) -- never a hidden/predicted defender
  // shield, only whatever's currently in state.tiles.
  const knownShieldFlags = collectKnownShieldFlags(state.tiles.values());
  for (const { x, y } of tilesAlongLine(originX, originY, targetX, targetY)) {
    if (x === originX && y === originY) continue; // never label the player's own flag tile
    if (entries.length >= MAX_WIN_CHANCE_LABELS) break;
    const tile = state.tiles.get(keyFor(x, y));
    if (!tile?.ownerId || tile.ownerId === state.me) continue; // only enemy-owned tiles the arrow crosses
    const knownShieldAmount = findKnownShieldAmount(x, y, tile.ownerId, knownShieldFlags);
    const { winChance, color } = winChanceForTile(previewTileFor(tile), {
      knownShieldAmount,
      modifiers: { nowMs: Date.now() },
      ...(commit ? { committedManpower: commit.committedManpower, baseMusterCost: commit.baseMusterCost } : {})
    });
    entries.push({ x, y, winChance, color });
  }
  return entries;
};

/**
 * Computes and stashes state.winChancePaint: a "XX%" label for every
 * enemy-owned tile the origin->target line crosses (the player's own origin
 * tile is never labeled). No-op when targeting was cancelled (vis is
 * "unexplored") or origin===target, same cancel rule
 * handleMusterMarchTargetClick applies.
 *
 * `commit`, when passed, scores every label against that chosen
 * commitManpower over the target tile's own base muster cost (the confirm
 * sheet's slider-live recompute) instead of each tile's own "just enough"
 * default (commit === base, i.e. no boost/penalty) used when omitted.
 */
export const triggerWinChancePaintOnMarchArm = (
  state: Pick<ClientState, "tiles" | "winChancePaint" | "me">,
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  vis: "visible" | "fogged" | "unexplored",
  keyFor: (x: number, y: number) => string,
  nowMs: number,
  commit?: { committedManpower: number; baseMusterCost: number }
): void => {
  if (vis === "unexplored" || (targetX === originX && targetY === originY)) return;
  const entries = winChanceEntriesAlongLine(state, originX, originY, targetX, targetY, keyFor, commit);
  state.winChancePaint = { targetX, targetY, expiresAt: nowMs + WIN_CHANCE_PAINT_DURATION_MS, entries };
};

const pct = (winChance: number): string => `${Math.round(winChance * 100)}%`;

/**
 * The March To sheet's live info line: the win chance at the march target
 * at the chosen commitment, plus the weakest odds on the way there when an
 * enemy tile en route is harder than the target itself.
 */
export const describeMarchWinChance = (
  state: Pick<ClientState, "tiles" | "me">,
  origin: { x: number; y: number },
  target: { x: number; y: number },
  keyFor: (x: number, y: number) => string,
  commit: { committedManpower: number; baseMusterCost: number }
): string => {
  const entries = winChanceEntriesAlongLine(state, origin.x, origin.y, target.x, target.y, keyFor, commit);
  const cost = `commits ${commit.committedManpower} manpower per attack`;
  if (entries.length === 0) return `No enemy tiles on this route yet · ${cost}`;
  const atTarget = entries.find((e) => e.x === target.x && e.y === target.y);
  const weakest = entries.reduce((low, e) => (e.winChance < low.winChance ? e : low));
  if (!atTarget) return `Lowest win chance on route ${pct(weakest.winChance)} · ${cost}`;
  const route = weakest.winChance < atTarget.winChance ? ` · lowest on route ${pct(weakest.winChance)}` : "";
  return `Win chance ${pct(atTarget.winChance)}${route} · ${cost}`;
};
