import type { ClientState } from "../client-state/client-state.js";

type RowToggleState = Pick<ClientState, "expandedSocialPlayerId">;

/**
 * Shows only `playerId`'s action buttons (or none when undefined) on every
 * copy of the met-players list under `root` -- the desktop panel and the
 * mobile sheet each render one.
 */
const applyExpandedRow = (root: ParentNode, playerId: string | undefined): void => {
  root.querySelectorAll<HTMLElement>(".alliance-player-card[data-player-row-id]").forEach((card) => {
    const open = playerId !== undefined && card.dataset.playerRowId === playerId && card.querySelector(".alliance-player-toggle") !== null;
    card.classList.toggle("is-expanded", open);
    card.querySelector(".alliance-player-toggle")?.setAttribute("aria-expanded", String(open));
  });
};

/**
 * Wires the compact "Players you've met" rows from client-alliance-panel.ts:
 * tapping a row (anywhere but the player's name, which opens their profile)
 * reveals its Propose Alliance / Truce buttons and collapses whichever row was
 * open. The choice lives in client state because the HUD rewrites the panel's
 * innerHTML on nearly every gateway message; the DOM is patched in place so the
 * tap responds without waiting for the next render.
 */
export const bindMetPlayerRowToggles = (root: ParentNode, state: RowToggleState): void => {
  root.querySelectorAll<HTMLElement>(".alliance-player-card[data-player-row-id] .alliance-player-row").forEach((row) => {
    const card = row.closest<HTMLElement>(".alliance-player-card");
    const playerId = card?.dataset.playerRowId;
    if (!playerId || !card?.querySelector(".alliance-player-toggle")) return;
    row.onclick = (event) => {
      if ((event.target as Element | null)?.closest("[data-inspect-player]")) return;
      state.expandedSocialPlayerId = state.expandedSocialPlayerId === playerId ? undefined : playerId;
      applyExpandedRow(root, state.expandedSocialPlayerId);
    };
  });
};
