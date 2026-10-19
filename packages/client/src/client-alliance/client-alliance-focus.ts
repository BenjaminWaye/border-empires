import type { ClientState } from "../client-state/client-state.js";

/**
 * After the Alliances panel HTML is written, highlights the card of the player
 * the user jumped to via a tile's Diplomacy action and scrolls it into view
 * once. The highlight is re-applied on every render until it expires, because
 * the HUD rewrites the panel's innerHTML on nearly every gateway message.
 */
export const applySocialFocus = (
  roots: ParentNode[],
  state: Pick<ClientState, "socialFocus">,
  nowMs: number = Date.now()
): void => {
  const focus = state.socialFocus;
  if (!focus) return;
  if (nowMs >= focus.until) {
    state.socialFocus = undefined;
    return;
  }
  let scrolled = false;
  for (const root of roots) {
    const buttons = Array.from(root.querySelectorAll("[data-player-name-id]")) as HTMLElement[];
    for (const button of buttons) {
      if (button.dataset.playerNameId !== focus.playerId) continue;
      const card = button.closest("article") as HTMLElement | null;
      if (!card) continue;
      card.classList.add("alliance-focus-highlight");
      if (focus.scrollPending && !scrolled) {
        card.scrollIntoView?.({ block: "center", behavior: "smooth" });
        scrolled = true;
      }
    }
  }
  if (scrolled) focus.scrollPending = false;
};
