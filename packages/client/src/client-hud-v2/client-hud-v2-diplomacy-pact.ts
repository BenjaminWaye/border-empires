// The pact line on the Diplomacy deal screen: where you stand with this
// empire and the controls that end it (Break Truce / Break Alliance).
//
// Playtest 2026-11-13: Break Truce lived only in the Alliances panel and the
// tile menu on a truced empire's land, and the Alliances panel opened only
// from an ally's tile. On a phone with no partner's land in view, neither
// could be reached (pt-strategist, pt-diplomat).
import { breakAllianceConsequences, breakTruceConsequences, showBreakPactSheet, type BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { socialRemainingLabel } from "../client-panel-html/client-panel-html.js";
import { isTruceEndingSoon, truceTimeLeftLabel } from "../client-truce-ending/client-truce-ending.js";
import type { ActiveAllianceBreakView, ActiveTruceView } from "../client-types.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

export type DealPactInput = {
  targetId: string;
  allies: readonly string[];
  activeTruces: readonly ActiveTruceView[];
  activeAllianceBreaks: readonly ActiveAllianceBreakView[];
  nowMs: number;
};

const esc = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Empty when there is no pact with the target. */
export const dealPactHtml = (input: DealPactInput): string => {
  const id = esc(input.targetId);
  if (input.allies.includes(input.targetId)) {
    const breaking = input.activeAllianceBreaks.find((b) => b.otherPlayerId === input.targetId && b.endsAt > input.nowMs);
    const control = breaking
      ? `<span class="v2d-pact-note">Alliance ends in ${esc(socialRemainingLabel(breaking.endsAt, input.nowMs))}</span>`
      : `<button type="button" class="v2s-btn v2s-btn-sm" data-v2-dip-break="alliance" data-player-id="${id}">Break Alliance</button>`;
    return `<div class="v2d-pact"><span class="v2d-pact-state">Allied</span>${control}</div>`;
  }
  const truce = input.activeTruces.find((t) => t.otherPlayerId === input.targetId && t.endsAt > input.nowMs);
  if (!truce) return "";
  // Last two hours: the minutes and a warning colour; the deal's Extend 12h / 24h buttons sit just below.
  const ending = isTruceEndingSoon(truce, input.nowMs);
  const left = ending ? `Truce ends in ${esc(truceTimeLeftLabel(truce.endsAt, input.nowMs))}` : `Truce · ${esc(socialRemainingLabel(truce.endsAt, input.nowMs))} left`;
  const control = truce.origin === "court"
    ? `<span class="v2d-pact-note">Court armistice · binding</span>`
    : `<button type="button" class="v2s-btn v2s-btn-sm" data-v2-dip-break="truce" data-player-id="${id}" title="Breaking a truce locks you out of new truces for 24h">Break Truce</button>`;
  return `<div class="v2d-pact${ending ? " v2d-pact-ending" : ""}"><span class="v2d-pact-state">${left}</span>${control}</div>`;
};

/** The confirmation sheet for a Break button on the pact line. */
export const breakPactSheetFor = (kind: "truce" | "alliance", targetId: string, name: string, deps: Pick<HudV2Deps, "sendGameMessage">): BreakPactSheetOptions =>
  kind === "truce"
    ? {
        title: `Break truce with ${name}?`,
        subtitle: `Breaking the truce with ${name} has consequences.`,
        consequences: breakTruceConsequences(name),
        confirmLabel: "Break Truce",
        onConfirm: () => void deps.sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId: targetId }, "Finish sign-in before breaking truces.")
      }
    : {
        title: `Break alliance with ${name}?`,
        subtitle: `${name} is your ally. Breaking takes 24 hours.`,
        consequences: breakAllianceConsequences(name),
        confirmLabel: "Break Alliance",
        onConfirm: () => void deps.sendGameMessage({ type: "ALLIANCE_BREAK", targetPlayerId: targetId }, "Finish sign-in before breaking alliances.")
      };

/** Clicks on the pact line's Break buttons; true when handled. */
export const dealPactClick = (
  deps: Pick<HudV2Deps, "state" | "sendGameMessage">,
  target: Element,
  showSheet: (options: BreakPactSheetOptions) => boolean = showBreakPactSheet
): boolean => {
  const breakButton = target.closest<HTMLElement>("[data-v2-dip-break]");
  if (!breakButton) return false;
  const targetId = breakButton.dataset.playerId ?? "";
  const kind = breakButton.dataset.v2DipBreak === "alliance" ? "alliance" : "truce";
  if (targetId) showSheet(breakPactSheetFor(kind, targetId, deps.state.playerNames.get(targetId) || "this empire", deps));
  return true;
};
