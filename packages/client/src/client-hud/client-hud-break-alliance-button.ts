// Wiring for the Alliances panel's "Break Alliance" button, split out of client-hud.ts to keep
// that file under the repo's 500-line cap. Breaking starts a 24h notice rather than breaking
// instantly (see ALLIANCE_BREAK_NOTICE_MS in social-state.ts) and costs opinion with an AI ex-ally,
// so it confirms first -- with the in-game pact sheet the Diplomacy screen uses, not window.confirm:
// an in-app browser can drop native dialogs silently, so the button did nothing (Playtest Run 4).
import { breakAllianceConsequences, showBreakPactSheet, type BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";

export const bindBreakAllianceButton = (
  btn: HTMLButtonElement,
  sendGameMessage: (payload: unknown, message?: string) => boolean,
  showSheet: (options: BreakPactSheetOptions) => boolean = showBreakPactSheet
): void => {
  btn.onclick = () => {
    const targetPlayerId = btn.dataset.allianceBreakPlayerId;
    if (!targetPlayerId) return;
    const name = btn.dataset.allianceBreakPlayerName || "this empire";
    showSheet({
      title: `Break alliance with ${name}?`,
      subtitle: `${name} is your ally. Breaking takes 24 hours.`,
      consequences: breakAllianceConsequences(name),
      confirmLabel: "Break Alliance",
      onConfirm: () => void sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId }, "Finish sign-in before breaking alliances.")
    });
  };
};
