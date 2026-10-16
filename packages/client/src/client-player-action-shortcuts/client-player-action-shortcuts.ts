import { openDiplomacyTradeScreen, type DiplomacyTradeDeps } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import {
  breakAllianceFromUi,
  breakTruceFromUi,
  chooseDomainFromUi,
  chooseTechFromUi,
  type PlayerActionDeps
} from "../client-player-actions.js";

// Truce and alliance offers open the trade screen (terms + live AI verdict)
// instead of sending straight away; the screen sends the offer itself.
const tradeDeps = (deps: PlayerActionDeps): DiplomacyTradeDeps => ({
  send: (payload, notSignedInMessage) => deps.sendGameMessage(payload, notSignedInMessage),
  ownHoldings: () => ({
    gold: Math.max(0, Math.floor(deps.state.gold)),
    shard: Math.max(0, Math.floor(deps.state.strategicResources.SHARD ?? 0))
  })
});

export const createPlayerActionShortcuts = (deps: PlayerActionDeps) => ({
  sendAllianceRequest: (target: string): void =>
    openDiplomacyTradeScreen({ targetName: target, kind: "alliance", durationHours: 12 }, tradeDeps(deps)),
  sendTruceRequest: (targetPlayerName: string, durationHours: 12 | 24): void =>
    openDiplomacyTradeScreen({ targetName: targetPlayerName, kind: "truce", durationHours }, tradeDeps(deps)),
  breakAlliance: (target: string): void => breakAllianceFromUi(target, deps),
  breakTruce: (targetPlayerId: string): void => breakTruceFromUi(targetPlayerId, deps),
  chooseTech: (techIdRaw?: string): void => chooseTechFromUi(techIdRaw, deps),
  chooseDomain: (domainIdRaw?: string): void => chooseDomainFromUi(domainIdRaw, deps)
});
