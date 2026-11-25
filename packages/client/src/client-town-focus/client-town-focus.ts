import { TOWN_FOCUSES, TOWN_FOCUS_LABELS, TOWN_FOCUS_MULTIPLIERS, nextManpowerRefillAtMs, type TownFocus } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { formatCooldownShort } from "../client-app-runtime-utils.js";

// Town focus (docs/town-focus-plan.md): four free rows on an owned town's
// action menu. DOM actions are shared by the canvas and true-3D maps.

type TownFocusActionId = "town_focus_balanced" | "town_focus_growth" | "town_focus_levy" | "town_focus_commerce";

const ACTION_ID: Readonly<Record<TownFocus, TownFocusActionId>> = {
  BALANCED: "town_focus_balanced",
  GROWTH: "town_focus_growth",
  LEVY: "town_focus_levy",
  COMMERCE: "town_focus_commerce"
};

const FOCUS_FOR_ACTION = new Map<string, TownFocus>(TOWN_FOCUSES.map((focus) => [ACTION_ID[focus], focus]));

const FOCUS_DETAIL: Readonly<Record<TownFocus, string>> = {
  BALANCED: "The town's people keep to their usual work.",
  GROWTH: "The House supplies and shelters the town, so its people stay and multiply.",
  LEVY: "More of the town's people are taken into Ancillary service.",
  COMMERCE: "Part of the town's labour is contracted offworld, and creditors extend more Coin against the rest."
};

const percent = (mult: number): string => `${mult >= 1 ? "+" : "−"}${Math.round(Math.abs(mult - 1) * 100)}%`;

/** "Growth +20% · Manpower −10% · Coin −10%", or "No change" for Balanced. */
export const townFocusEffectText = (focus: TownFocus): string => {
  const mult = TOWN_FOCUS_MULTIPLIERS[focus];
  if (focus === "BALANCED") return "No change to growth, manpower or Coin";
  return `Growth ${percent(mult.growth)} · Manpower regen ${percent(mult.manpowerRegen)} · Coin ${percent(mult.coin)}`;
};

export function townFocusActions(state: Pick<ClientState, "me">, tile: Tile, now = Date.now()): TileActionDef[] {
  const town = tile.town;
  if (tile.fogged || !state.me || !town || tile.ownerId !== state.me) return [];
  const active: TownFocus = town.focus ?? "BALANCED";
  const pending = town.pendingFocus;
  const pendingInMs = Math.max(0, (town.pendingFocusAt ?? now) - now);
  const nextRefillInMs = Math.max(0, nextManpowerRefillAtMs(state.me, now) - now);
  return TOWN_FOCUSES.map((focus): TileActionDef => {
    const isActive = focus === active;
    const isQueued = focus === pending;
    const reason = isQueued
      ? `Queued · starts in ${formatCooldownShort(pendingInMs)}`
      : isActive && !pending ? "Current focus" : "";
    const label = isActive && pending ? `Keep ${TOWN_FOCUS_LABELS[focus]} focus` : `${TOWN_FOCUS_LABELS[focus]} focus`;
    const timing = isActive && pending
      ? `Cancels the queued ${TOWN_FOCUS_LABELS[pending]} focus.`
      : `Free. Starts at your next manpower refill (in ${formatCooldownShort(nextRefillInMs)}); manpower it earns is paid at the refill after that.`;
    return {
      id: ACTION_ID[focus],
      label,
      detail: `${FOCUS_DETAIL[focus]} ${townFocusEffectText(focus)}. ${timing}`,
      cost: isActive && !pending ? "Current" : "Free",
      disabled: Boolean(reason),
      ...(reason ? { disabledReason: reason } : {})
    };
  });
}

/** Sends SET_TOWN_FOCUS for a town focus row; ignores every other action. */
export function dispatchTownFocusAction(actionId: string, selected: Pick<Tile, "x" | "y">, send: (payload: unknown) => boolean): void {
  const focus = FOCUS_FOR_ACTION.get(actionId);
  if (focus) send({ type: "SET_TOWN_FOCUS", tiles: [{ x: selected.x, y: selected.y }], focus });
}
