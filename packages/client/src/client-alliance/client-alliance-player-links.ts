import type { ClientState } from "../client-state/client-state.js";
import { fallbackOwnerColor, resolveOwnerColor } from "../client-owner-colors/client-owner-colors.js";
import { bindMetPlayerRowToggles } from "./client-alliance-row-toggle.js";

type PlayerLinkState = Pick<ClientState, "playerColors" | "socialInspectPlayerId" | "expandedSocialPlayerId">;

// Every player name in the Alliances tab (met rows, allies, requests) and the
// inspect card's heading carry the player id in one of these attributes.
const COLORED_NAME_SELECTOR = "[data-inspect-player], [data-player-color-id]";

/**
 * Gives each player name a swatch of that player's map colour (drawn by
 * `.has-player-color::before`), using the same fallback hue as the map for a
 * player with no assigned colour yet.
 */
export const applyPlayerNameColors = (root: ParentNode, playerColors: ReadonlyMap<string, string>): void => {
  root.querySelectorAll<HTMLElement>(COLORED_NAME_SELECTOR).forEach((el) => {
    const playerId = el.dataset.inspectPlayer ?? el.dataset.playerColorId;
    if (!playerId) return;
    el.style.setProperty("--player-color", resolveOwnerColor(playerId, playerColors, fallbackOwnerColor));
    el.classList.add("has-player-color");
  });
};

/**
 * Tapping a player's name opens their card (score, tiles, income, techs) in
 * the panel's inspect slot, and tapping it again closes it. The card scrolls
 * into view because it sits below the lists.
 */
export const bindPlayerNameLinks = (root: ParentNode, state: Pick<PlayerLinkState, "socialInspectPlayerId">, rerender: () => void): void => {
  root.querySelectorAll<HTMLButtonElement>("button[data-inspect-player]").forEach((button) => {
    button.onclick = () => {
      const playerId = button.dataset.inspectPlayer;
      if (!playerId) return;
      // Look the slot up before rerendering: the rerender replaces this button.
      const slot = button.closest(".alliance-panel")?.querySelector<HTMLElement>(".alliance-player-inspect-slot");
      state.socialInspectPlayerId = state.socialInspectPlayerId === playerId ? "" : playerId;
      rerender();
      if (state.socialInspectPlayerId) slot?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    };
  });
};

/** All per-render wiring for player rows and names in the Alliances tab (desktop panel and mobile sheet). */
export const bindAlliancePlayerRows = (root: ParentNode, state: PlayerLinkState, rerender: () => void): void => {
  bindMetPlayerRowToggles(root, state);
  bindPlayerNameLinks(root, state, rerender);
  applyPlayerNameColors(root, state.playerColors);
};
