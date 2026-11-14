// One-message tile commands from the tile menu and town screen: Create /
// Remove Mountain and Abandon Territory. Abandon Territory used to send
// UNCAPTURE_TILE on a single tap, with no confirm, from the town screen's
// small text buttons too; a tap landing on it during a layout shift gave away
// a whole town with nothing saying so (2026-11-13 playtest, pt-achiever).
// It now always asks first, and names the town when the tile is one.
import { showBreakPactSheet, type BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import type { Tile } from "../client-types.js";

/** What abandoning this tile costs, one short line each. */
export const abandonTerritoryConsequences = (tile: Pick<Tile, "town">): string[] => [
  ...(tile.town
    ? [`You lose the town${tile.town.name ? ` ${tile.town.name}` : ""}: its coin, manpower cap and build plots.`]
    : []),
  "The tile goes neutral. Anyone can claim it, and buildings on it go to whoever does.",
  "This can't be undone. You would have to claim the tile again."
];

/** Asks before sending UNCAPTURE_TILE. Sends nothing when no sheet can be shown: giving land away must never happen unasked. */
export const confirmAbandonTerritory = (input: {
  tile: Pick<Tile, "x" | "y" | "town">;
  send: () => void;
  show?: (options: BreakPactSheetOptions) => boolean;
}): boolean => {
  const { tile } = input;
  return (input.show ?? showBreakPactSheet)({
    title: tile.town ? `Abandon ${tile.town.name ?? "this town"}?` : "Abandon this tile?",
    subtitle: `Gives up (${tile.x}, ${tile.y}).`,
    consequences: abandonTerritoryConsequences(tile),
    confirmLabel: "Abandon",
    onConfirm: input.send
  });
};

type TileCommand = { type: "CREATE_MOUNTAIN" | "REMOVE_MOUNTAIN" | "UNCAPTURE_TILE"; x: number; y: number };

/** Sends the tile command for `actionId`, if it is one of these; Abandon Territory goes through the confirm first. */
export const dispatchSimpleTileCommand = (
  actionId: string,
  tile: Pick<Tile, "x" | "y" | "town">,
  sendGameMessage: (payload: TileCommand) => boolean,
  show?: (options: BreakPactSheetOptions) => boolean
): void => {
  const at = { x: tile.x, y: tile.y };
  if (actionId === "create_mountain") sendGameMessage({ type: "CREATE_MOUNTAIN", ...at });
  if (actionId === "remove_mountain") sendGameMessage({ type: "REMOVE_MOUNTAIN", ...at });
  if (actionId === "abandon_territory") {
    confirmAbandonTerritory({ tile, send: () => void sendGameMessage({ type: "UNCAPTURE_TILE", ...at }), ...(show ? { show } : {}) });
  }
};
