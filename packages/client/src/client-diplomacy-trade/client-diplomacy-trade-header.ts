// The trade screen's header lines under the title: the target's stance and
// attitude, its temperament, the Civ-style attitude modifiers, and the war
// tally. Extracted from client-diplomacy-trade.ts (500-line source budget).
import { attitudeSummary, temperamentLine, warTallyHtml, type ChronicleWarCounts, type DiplomacyStanceReply } from "./client-diplomacy-trade-view.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

export const renderTradeHeader = (overlay: HTMLElement, reply: DiplomacyStanceReply | undefined, targetName: string, chronicle: ChronicleWarCounts | undefined): void => {
  const stanceEl = overlay.querySelector<HTMLElement>("[data-trade-stance]");
  if (stanceEl) {
    stanceEl.textContent =
      reply?.found && reply.ai && reply.stance
        ? [attitudeSummary(reply), reply.stance.reason].filter(Boolean).join(". ")
        : reply?.found && !reply.ai ? "Another player." : "";
  }
  const temperamentEl = overlay.querySelector<HTMLElement>("[data-trade-temperament]");
  if (temperamentEl) {
    temperamentEl.textContent = temperamentLine(reply);
    temperamentEl.hidden = !temperamentEl.textContent;
  }
  // Civ-style breakdown of the attitude: what pleases or angers this empire.
  const modifiersEl = overlay.querySelector<HTMLElement>("[data-trade-modifiers]");
  if (modifiersEl) {
    const modifiers = reply?.found && reply.ai ? (reply.attitude?.modifiers ?? []) : [];
    modifiersEl.hidden = modifiers.length === 0;
    modifiersEl.innerHTML = modifiers
      .map((modifier) => `<li data-tone="${modifier.value >= 0 ? "good" : "bad"}"><span>${modifier.value > 0 ? "+" : ""}${modifier.value}</span> ${escapeHtml(modifier.label)}</li>`)
      .join("");
  }
  // The war's tiles: as the Chronicle counts them when it has this empire, and as the AI weighs them.
  const warEl = overlay.querySelector<HTMLElement>("[data-trade-war]");
  if (warEl) {
    warEl.innerHTML = warTallyHtml(reply, targetName, reply?.found ? chronicle : undefined);
    warEl.hidden = !warEl.innerHTML;
  }
};
