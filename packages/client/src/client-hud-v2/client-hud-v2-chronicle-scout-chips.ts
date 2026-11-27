// A scout report row in Chronicle → Yours names each find as its own link:
// "Scout drone found [1 town], [1 waystation], [GRAIN (10 tiles)]". Clicking
// one flies the camera to it and rings every tile of that find for a few
// seconds (client-scout-finding-highlight.ts), on the 2D and true-3D maps.
// Reports filed before finds carried tiles keep the plain text and the row's Show.

import type { PersonalActivityCard } from "@border-empires/game-domain";
import type { ScoutFindingTile } from "@border-empires/shared";
import { nameOf as resolvedName, type PlayerNameLookup } from "../client-activity-dashboard/client-activity-dashboard-names.js";
import { scoutFindingParts } from "../client-scout-drone/client-scout-drone-state.js";
import { reportedPlaces } from "../client-scout-drone/client-scout-drone-find-places.js";
import { showScoutFindingHighlight } from "../client-scout-drone/client-scout-finding-highlight.js";
import { focusCamera, screen, type HudV2Deps } from "./client-hud-v2-context.js";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const encodeTiles = (tiles: readonly ScoutFindingTile[]): string => tiles.map((t) => `${t.x},${t.y}`).join(";");

/** Parses data-tiles back into tiles, dropping anything malformed. */
export const decodeScoutFindTiles = (value: string | undefined): ScoutFindingTile[] =>
  (value ?? "").split(";").flatMap((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return pair && Number.isFinite(x) && Number.isFinite(y) ? [{ x: x as number, y: y as number }] : [];
  });

/**
 * The row's text with each find as a link, or undefined when the card is not a
 * scout report or predates find tiles (the caller then uses the plain text).
 */
export const scoutReportFindsHtml = (card: PersonalActivityCard, playerNames: PlayerNameLookup): string | undefined => {
  if (card.kind !== "SCOUT_REPORT" || !card.sites) return undefined;
  const parts = scoutFindingParts(card, (id) => resolvedName(id, playerNames));
  const finds = parts.map((part) =>
    part.tiles.length > 0
      ? `<button type="button" class="v2c-find" data-v2-chronicle-find="${esc(card.id)}" data-tiles="${encodeTiles(part.tiles)}">${esc(part.text)}</button>`
      : esc(part.text)
  ).join(", ");
  const turned = card.blockedByPlayerId ? ` · turned back at ${esc(resolvedName(card.blockedByPlayerId, playerNames))}'s border` : "";
  return `Scout drone ${finds ? `found ${finds}` : "found nothing new"}${turned}`;
};

/** A find link: camera to its first tile, ring all its tiles, select the row. True when handled. */
export const chronicleScoutFindClick = (deps: Pick<HudV2Deps, "state" | "wrapX" | "wrapY" | "requestViewRefresh" | "renderHud">, target: Element, rerender: () => void): boolean => {
  const find = target.closest<HTMLElement>("[data-v2-chronicle-find]");
  if (!find) return false;
  // The reported place, not the edge pressed into the player's land (client-scout-drone-find-places.ts); a
  // find held by them since keeps its old tiles, so an old row still goes somewhere.
  const listed = decodeScoutFindTiles(find.dataset.tiles);
  const clear = reportedPlaces(deps.state, listed);
  const tiles = clear.length > 0 ? clear : listed;
  const first = tiles[0];
  if (first) {
    focusCamera(deps, first.x, first.y);
    showScoutFindingHighlight(deps.state, tiles, Date.now());
  }
  screen.chronicleSelectedId = find.dataset.v2ChronicleFind;
  rerender();
  deps.renderHud();
  return true;
};
