import { diplomacyTradeDepsFor, openDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import { bindCounterOfferButtons, type CounterOfferDeps } from "./client-alliance-counter-offer.js";

/** state: the player's coin and Shards (the trade screen's "what can I offer") and the offers they can counter. */
type ProposeButtonDeps = CounterOfferDeps;

/**
 * Wires the per-player "Propose Alliance" / "Truce 12h|24h" / "Break Truce"
 * buttons rendered by client-alliance-panel.ts. The gateway resolves a request target by display
 * name, so the name is looked up from the player id at click time. Truce and
 * alliance offers open the diplomacy trade screen (terms + the AI's verdict);
 * the screen sends the offer. "Counter" on an incoming offer opens the same
 * screen pre-filled with that offer (client-alliance-counter-offer.ts).
 */
export const bindProposeButtons = (root: ParentNode, deps: ProposeButtonDeps): void => {
  bindCounterOfferButtons(root, deps);
  root.querySelectorAll<HTMLButtonElement>(".propose-alliance").forEach((btn) => {
    btn.onclick = () => {
      const targetPlayerName = deps.playerNameForOwner(btn.dataset.proposePlayerId);
      if (!targetPlayerName) return;
      openDiplomacyTradeScreen({ targetName: targetPlayerName, kind: "alliance", durationHours: 12 }, diplomacyTradeDepsFor(deps.state, deps.sendGameMessage));
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".break-truce").forEach((btn) => {
    btn.onclick = () => {
      const targetPlayerId = btn.dataset.breakTrucePlayerId;
      if (!targetPlayerId) return;
      deps.sendGameMessage({ type: "TRUCE_BREAK", targetPlayerId }, "Finish sign-in before breaking truces.");
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".propose-truce").forEach((btn) => {
    btn.onclick = () => {
      const targetPlayerName = deps.playerNameForOwner(btn.dataset.proposePlayerId);
      const durationHours = btn.dataset.truceHours === "24" ? 24 : 12;
      if (!targetPlayerName) return;
      openDiplomacyTradeScreen({ targetName: targetPlayerName, kind: "truce", durationHours }, diplomacyTradeDepsFor(deps.state, deps.sendGameMessage));
    };
  });
};
