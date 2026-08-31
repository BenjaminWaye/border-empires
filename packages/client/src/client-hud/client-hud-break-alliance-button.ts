// Wiring for the "Break Alliance" button, split out of client-hud.ts to keep
// that file under the repo's 500-line cap. Confirms with the player first,
// since breaking an alliance starts a 24h notice rather than breaking it
// instantly (see ALLIANCE_BREAK_NOTICE_MS in social-state.ts).
export const bindBreakAllianceButton = (
  btn: HTMLButtonElement,
  sendGameMessage: (payload: unknown, message?: string) => boolean
): void => {
  btn.onclick = () => {
    const targetPlayerId = btn.dataset.allianceBreakPlayerId;
    if (!targetPlayerId) return;
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const confirmed = window.confirm("Break this alliance? It takes 24 hours for an alliance to break once you confirm.");
      if (!confirmed) return;
    }
    sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId }, "Finish sign-in before breaking alliances.");
  };
};
