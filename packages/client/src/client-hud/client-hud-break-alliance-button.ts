// Wiring for the "Break Alliance" button, split out of client-hud.ts to keep
// that file under the repo's 500-line cap. Confirms with the player first,
// since breaking an alliance starts a 24h notice rather than breaking it
// instantly (see ALLIANCE_BREAK_NOTICE_MS in social-state.ts) and costs
// opinion with an AI ex-ally (breakAllianceConsequences).
import {
  BROKEN_ALLIANCE_OPINION_PENALTY,
  BROKEN_PACT_OPINION_WINDOW_DAYS
} from "@border-empires/shared";

export const bindBreakAllianceButton = (
  btn: HTMLButtonElement,
  sendGameMessage: (payload: unknown, message?: string) => boolean
): void => {
  btn.onclick = () => {
    const targetPlayerId = btn.dataset.allianceBreakPlayerId;
    if (!targetPlayerId) return;
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const confirmed = window.confirm(`Break this alliance? It will be broken 24 hours after you confirm, and you can attack them only after that. An AI ally will think less of you (−${BROKEN_ALLIANCE_OPINION_PENALTY} opinion for ${BROKEN_PACT_OPINION_WINDOW_DAYS} days).`);
      if (!confirmed) return;
    }
    sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId }, "Finish sign-in before breaking alliances.");
  };
};
