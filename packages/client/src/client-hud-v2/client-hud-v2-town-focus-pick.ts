// Sends a Town focus choice (docs/town-focus-plan.md) and shows it at once:
// the town record is updated the way the server will store it, and the
// server's tile update replaces it moments later.
import { MANPOWER_REFILL_WINDOW_MS, TOWN_FOCUS_MAX_TILES_PER_COMMAND, activeTownFocus, type TownFocus } from "@border-empires/shared";
import { pushFeed } from "../client-alerts/client-alerts.js";
import { optimisticTownFocus, townFocusCounts, townFocusEmpireCoinPerDay, townFocusName, townFocusTagline } from "../client-town-focus/client-town-focus.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";
import type { TownFocusCardExtras } from "./client-hud-v2-town-focus.js";

/** "Vellmar Reach: Levy · Kest: Growth · 3 Balanced", for the empire line's tooltip. */
const townFocusBreakdown = (towns: readonly Tile[]): string => {
  const set = towns.filter((tile) => tile.town?.focus && tile.town.focus !== "BALANCED").map((tile) => `${tile.town?.name ?? `${tile.x},${tile.y}`}: ${townFocusName(tile.town!.focus!)}`);
  const balanced = towns.filter((tile) => tile.town && (tile.town.focus ?? "BALANCED") === "BALANCED").length;
  return [...set, ...(balanced > 0 ? [`${balanced} Balanced`] : [])].join(" · ");
};

/** How long a picked row flashes; renders inside this window replay it, later ones do not. */
const FLASH_MS = 900;
let lastPick: { townKey: string; focus: TownFocus; at: number } | undefined;
/** How long a focus that the refill just made active glows. */
const ARRIVE_MS = 1_400;
/** How close to the queued change's own time a promotion must be seen to glow (not hours later on reopening). */
const ARRIVE_WINDOW_MS = 2 * 60_000;
/** Per town, the active and queued focus last seen, to notice the refill promoting a queued one; bounded by the player's towns. */
const seenFocus = new Map<string, { active: TownFocus; pending: TownFocus | undefined; pendingAt: number | undefined; arrivedAt: number }>();
/** How long "All towns" waits for its confirming second press. */
const CONFIRM_ALL_MS = 4_000;
let confirmAll: { townKey: string; focus: TownFocus; at: number } | undefined;

/**
 * First press of "All towns" arms it (the button asks to be pressed again); a second press within
 * CONFIRM_ALL_MS on the same town and focus confirms. Returns true when this press confirms.
 */
export const confirmTownFocusForAll = (townKey: string, focus: TownFocus, nowMs = Date.now()): boolean => {
  const armed = confirmAll !== undefined && confirmAll.townKey === townKey && confirmAll.focus === focus && nowMs - confirmAll.at < CONFIRM_ALL_MS;
  confirmAll = armed ? undefined : { townKey, focus, at: nowMs };
  return armed;
};

/** The card's empire line and pick flash for the open town. */
export const townFocusExtras = (state: Pick<ClientState, "manpowerBreakdown">, towns: readonly Tile[], townKey: string, nowMs = Date.now()): TownFocusCardExtras => {
  const line = state.manpowerBreakdown.regen.find((entry) => entry.label === "Town focus");
  const town = towns.find((tile) => `${tile.x},${tile.y}` === townKey)?.town;
  const active = activeTownFocus(town);
  const seen = seenFocus.get(townKey);
  // Glow only when the refill promoted the focus that was queued, and only around the time it was due.
  const promoted = seen !== undefined && seen.active !== active && seen.pending === active && seen.pendingAt !== undefined && Math.abs(nowMs - seen.pendingAt) < ARRIVE_WINDOW_MS;
  seenFocus.set(townKey, { active, pending: town?.pendingFocus, pendingAt: town?.pendingFocusAt, arrivedAt: promoted ? nowMs : seen?.arrivedAt ?? 0 });
  const arrivedAt = seenFocus.get(townKey)?.arrivedAt ?? 0;
  if (seenFocus.size > towns.length + 8) for (const key of seenFocus.keys()) if (!towns.some((tile) => `${tile.x},${tile.y}` === key)) seenFocus.delete(key);
  return {
    counts: townFocusCounts(towns),
    breakdown: townFocusBreakdown(towns),
    empireCoinPerDay: townFocusEmpireCoinPerDay(towns),
    ...(line ? { empireManpowerPerRefill: line.amount * (MANPOWER_REFILL_WINDOW_MS / 60_000) } : {}),
    ...(lastPick && lastPick.townKey === townKey && nowMs - lastPick.at < FLASH_MS ? { flash: lastPick.focus } : {}),
    ...(confirmAll && confirmAll.townKey === townKey && nowMs - confirmAll.at < CONFIRM_ALL_MS ? { confirmAll: true } : {}),
    ...(arrivedAt > 0 && nowMs - arrivedAt < ARRIVE_MS ? { arrived: active } : {})
  };
};

/** Returns true when the choice was sent (the screen should redraw). */
export const pickTownFocus = (deps: HudV2Deps, townKey: string, focus: TownFocus, nowMs = Date.now()): boolean => {
  const tile = deps.state.tiles.get(townKey);
  const me = deps.state.me;
  if (!tile?.town || !me || tile.ownerId !== me) return false;
  const next = optimisticTownFocus(tile.town, focus, me, nowMs);
  if (next === tile.town) return false;
  if (!deps.sendGameMessage({ type: "SET_TOWN_FOCUS", tiles: [{ x: tile.x, y: tile.y }], focus })) return false;
  deps.state.tiles.set(townKey, { ...tile, town: next });
  lastPick = { townKey, focus, at: nowMs };
  const town = tile.town.name ?? "This town";
  const cancelled = next.pendingFocus === undefined && focus === activeTownFocus(tile.town);
  pushFeed(deps.state, cancelled ? `${town} keeps its ${townFocusName(focus)} focus` : `${town} switches to ${townFocusName(focus)} at your next refill: ${townFocusTagline(focus).toLowerCase()}`, "info", "info");
  return true;
};

/**
 * "Apply to all towns": queues `focus` on every one of the player's towns in one
 * SET_TOWN_FOCUS (the server takes up to TOWN_FOCUS_MAX_TILES_PER_COMMAND).
 * Returns how many towns changed.
 */
export const pickTownFocusForAll = (deps: HudV2Deps, towns: readonly Tile[], focus: TownFocus, nowMs = Date.now()): number => {
  const me = deps.state.me;
  if (!me) return 0;
  // Re-read each town from live state: the town list is cached for a moment, and writing back a stale copy would
  // undo a capture or any other update that arrived since.
  const changed = towns
    .map((listed) => deps.state.tiles.get(`${listed.x},${listed.y}`))
    .filter((tile): tile is Tile => Boolean(tile?.town) && tile?.ownerId === me)
    .map((tile) => ({ tile, next: optimisticTownFocus(tile.town!, focus, me, nowMs) }))
    .filter(({ tile, next }) => next !== tile.town)
    .slice(0, TOWN_FOCUS_MAX_TILES_PER_COMMAND);
  if (changed.length === 0 || !deps.sendGameMessage({ type: "SET_TOWN_FOCUS", tiles: changed.map(({ tile }) => ({ x: tile.x, y: tile.y })), focus })) return 0;
  for (const { tile, next } of changed) deps.state.tiles.set(`${tile.x},${tile.y}`, { ...tile, town: next });
  pushFeed(deps.state, `${changed.length} ${changed.length === 1 ? "town switches" : "towns switch"} to ${townFocusName(focus)} at your next refill`, "info", "info");
  return changed.length;
};
