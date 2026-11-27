import type { TileActionDef } from "../client-tile-action-def-types.js";

export type NeutralTileClickOutcome = "queue-adjacent-neutral" | "open-menu";

/**
 * How a map selection arrived. Both kinds now behave the same way: select
 * first, then confirm (see createTapConfirm). Kept on the input path because
 * the map binds mouse and touch separately.
 */
export type TileTapInput = "mouse" | "touch";

/**
 * Select first, then confirm (owner decision after the 2026-11-17 playtest).
 * One tap on a claimable or attackable tile used to spend manpower straight
 * away (a mouse click claimed adjacent land; testers on lagging browsers also
 * ended up with tiles they never chose). Now the first tap only selects the
 * tile and opens its sheet, which shows the action and its cost. Spending
 * happens on the sheet's action button, or on a second tap of the same tile.
 * Any tap disarms first, so tapping anywhere else cancels the pending confirm.
 */
export type TapConfirm = {
  /** Every tap calls this first. True when (x, y) is the tile the previous selecting tap armed. Always disarms. */
  take: (x: number, y: number) => boolean;
  /** The tap showed this tile's actions and cost: a second tap on it confirms. */
  arm: (x: number, y: number) => void;
  /** An action button ran (or the selection was dropped): the next tap selects again. */
  disarm: () => void;
  /** The tile waiting for a confirming tap, if any. */
  armed: () => { x: number; y: number } | undefined;
};

/**
 * `viewKey` describes the camera (pan + zoom). A pan, zoom or double-tap zoom
 * never reaches take(), so the arm also lapses when the view changed since it
 * was set: a tile looked at again after moving the map selects, never spends.
 */
export const createTapConfirm = (viewKey: () => string = () => ""): TapConfirm => {
  let armedTile: { x: number; y: number; view: string } | undefined;
  return {
    take: (x, y) => {
      const hit = armedTile !== undefined && armedTile.x === x && armedTile.y === y && armedTile.view === viewKey();
      armedTile = undefined;
      return hit;
    },
    arm: (x, y) => {
      armedTile = { x, y, view: viewKey() };
    },
    disarm: () => {
      armedTile = undefined;
    },
    armed: () => (armedTile ? { x: armedTile.x, y: armedTile.y } : undefined)
  };
};

// The only sheet actions a confirming tap may fire: claiming land and
// attacking. Everything else (building, garrisoning, abilities) still needs its
// own button.
const CONFIRM_TAP_ACTION_IDS: ReadonlySet<string> = new Set(["settle_land", "expand_here", "launch_attack"]);

/** The claim or attack a confirming second tap fires: the first enabled one on the tile's sheet. */
export const confirmTapAction = <A extends Pick<TileActionDef, "id" | "disabled">>(actions: readonly A[]): A | undefined =>
  actions.find((action) => CONFIRM_TAP_ACTION_IDS.has(action.id) && !action.disabled);

/**
 * The action a second tap on this tile may fire. Never on your own land: there
 * "settle_land" is the Garrison button, which spends and keeps its own button.
 * Never against an ally or truce partner (that would break the pact).
 */
export const confirmTapActionForTile = <A extends Pick<TileActionDef, "id" | "disabled">>(
  actions: readonly A[],
  guard: { ownTile: boolean; pactHolder: boolean }
): A | undefined => (guard.ownTile || guard.pactHolder ? undefined : confirmTapAction(actions));

/** A confirming tap fires only once the cost is known: never an attack whose preview is still loading. */
export const confirmTapReady = (action: Pick<TileActionDef, "loading"> | undefined): boolean => action !== undefined && !action.loading;

export const confirmTapActionId = (actions: readonly Pick<TileActionDef, "id" | "disabled">[]): TileActionDef["id"] | undefined =>
  confirmTapAction(actions)?.id;

export const neutralTileClickOutcome = (input: {
  isLand: boolean;
  isFogged: boolean;
  hasFrontierOrigin: boolean;
  isNeutral: boolean;
  /** True only for the second tap on the tile the previous tap selected (TapConfirm.take). */
  confirmTap: boolean;
}): NeutralTileClickOutcome => {
  const { isLand, isFogged, hasFrontierOrigin, isNeutral, confirmTap } = input;
  const adjacentNeutralClick = isLand && !isFogged && isNeutral && hasFrontierOrigin;
  return adjacentNeutralClick && confirmTap ? "queue-adjacent-neutral" : "open-menu";
};

/**
 * What the big confirm prompt shows for a sheet action. While an attack's
 * preview is still loading its cost would be missing or stale, so the prompt
 * shows the action without a number rather than a wrong one.
 */
export const confirmPromptOffer = (
  action: Pick<TileActionDef, "label" | "cost" | "disabled" | "loading"> | undefined
): { label: string; cost?: string; disabled?: boolean } | undefined => {
  if (!action) return undefined;
  const cost = action.loading ? undefined : action.cost;
  return { label: action.label, ...(cost ? { cost } : {}), ...(action.disabled ? { disabled: true } : {}) };
};

/**
 * The on-map confirm prompt for a tile tap, or nothing on the phone layout. There the tap also opens the bottom
 * tile sheet, whose gold primary button is the same claim or attack, so players saw two "Expand To" buttons for one
 * tile and didn't know which to press (playtest 2026-11-26). The re-tap on the tile still confirms. Relay Beacon
 * placement keeps its prompt: no sheet carries that one.
 */
export const offerBesideTileSheet = <T>(
  offer: T | undefined,
  doc: Document | undefined = typeof document === "undefined" ? undefined : document
): T | undefined => (doc?.body?.classList.contains("hud-v2-compact") ? undefined : offer);
