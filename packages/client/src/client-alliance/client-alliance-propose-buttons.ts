import { diplomacyTradeDepsFor, openDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";

type SendGameMessage = (payload: unknown, message?: string) => boolean;

type ProposeButtonDeps = {
  playerNameForOwner: (ownerId?: string | null) => string | undefined;
  sendGameMessage: SendGameMessage;
  /** The player's coin and Shards, for the trade screen's "what can I offer". */
  state: { gold: number; strategicResources: { SHARD?: number } };
};

/**
 * Wires the per-player "Propose Alliance" / "Truce 12h|24h" / "Break Truce"
 * buttons rendered by client-alliance-panel.ts. The gateway resolves a request target by display
 * name, so the name is looked up from the player id at click time. Truce and
 * alliance offers open the diplomacy trade screen (terms + the AI's verdict);
 * the screen sends the offer.
 */
export const bindProposeButtons = (root: ParentNode, deps: ProposeButtonDeps): void => {
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
