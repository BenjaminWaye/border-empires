// Sends a Town focus choice (docs/town-focus-plan.md) and shows it at once:
// the town record is updated the way the server will store it, and the
// server's tile update replaces it moments later.
import { MANPOWER_REFILL_WINDOW_MS, TOWN_FOCUS_MAX_TILES_PER_COMMAND, activeTownFocus, type TownFocus } from "@border-empires/shared";
import { pushFeed } from "../client-alerts/client-alerts.js";
import { optimisticTownFocus, townFocusCounts, townFocusEmpireCoinPerDay, townFocusName } from "../client-town-focus/client-town-focus.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";
import type { TownFocusCardExtras } from "./client-hud-v2-town-focus.js";

/** How long a picked row flashes; renders inside this window replay it, later ones do not. */
const FLASH_MS = 900;
let lastPick: { townKey: string; focus: TownFocus; at: number } | undefined;
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
  return {
    counts: townFocusCounts(towns),
    empireCoinPerDay: townFocusEmpireCoinPerDay(towns),
    ...(line ? { empireManpowerPerRefill: line.amount * (MANPOWER_REFILL_WINDOW_MS / 60_000) } : {}),
    ...(lastPick && lastPick.townKey === townKey && nowMs - lastPick.at < FLASH_MS ? { flash: lastPick.focus } : {}),
    ...(confirmAll && confirmAll.townKey === townKey && nowMs - confirmAll.at < CONFIRM_ALL_MS ? { confirmAll: true } : {})
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
  pushFeed(deps.state, cancelled ? `${town} keeps its ${townFocusName(focus)} focus` : `${town} switches to ${townFocusName(focus)} at your next refill`, "info", "info");
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
  const changed = towns
    .filter((tile) => tile.town && tile.ownerId === me)
    .map((tile) => ({ tile, next: optimisticTownFocus(tile.town!, focus, me, nowMs) }))
    .filter(({ tile, next }) => next !== tile.town)
    .slice(0, TOWN_FOCUS_MAX_TILES_PER_COMMAND);
  if (changed.length === 0 || !deps.sendGameMessage({ type: "SET_TOWN_FOCUS", tiles: changed.map(({ tile }) => ({ x: tile.x, y: tile.y })), focus })) return 0;
  for (const { tile, next } of changed) deps.state.tiles.set(`${tile.x},${tile.y}`, { ...tile, town: next });
  pushFeed(deps.state, `${changed.length} ${changed.length === 1 ? "town switches" : "towns switch"} to ${townFocusName(focus)} at your next refill`, "info", "info");
  return changed.length;
};
