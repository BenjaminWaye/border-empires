import { diplomacyTradeDepsFor, openDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import type { CounterOfferDeps } from "../client-alliance/client-alliance-counter-offer.js";

/**
 * Wires the Economy panel's "Review trade" buttons (Trade commitments, client-economy-commitments.ts):
 * each opens the resource trade screen with that partner. The id is on the button (a display name can be
 * shared by a human and an AI); the name is looked up at click time, falling back to the rendered one.
 */
export const bindResourceTradeButtons = (root: ParentNode, deps: CounterOfferDeps): void => {
  root.querySelectorAll<HTMLButtonElement>(".propose-resource-trade").forEach((btn) => {
    btn.onclick = () => {
      const targetPlayerId = btn.dataset.proposePlayerId;
      const targetName = deps.playerNameForOwner(targetPlayerId) || btn.dataset.proposePlayerName;
      if (!targetPlayerId || !targetName) return;
      openDiplomacyTradeScreen({ targetName, targetPlayerId, kind: "trade", durationHours: 12 }, diplomacyTradeDepsFor(deps.state, deps.sendGameMessage));
    };
  });
};
