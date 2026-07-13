import {
  breakAllianceFromUi,
  breakTruceFromUi,
  chooseDomainFromUi,
  chooseTechFromUi,
  sendAllianceRequestFromUi,
  sendTruceRequestFromUi,
  type PlayerActionDeps
} from "../client-player-actions.js";

export const createPlayerActionShortcuts = (deps: PlayerActionDeps) => ({
  sendAllianceRequest: (target: string): void => sendAllianceRequestFromUi(target, deps),
  sendTruceRequest: (targetPlayerName: string, durationHours: 12 | 24): void =>
    sendTruceRequestFromUi(targetPlayerName, durationHours, deps),
  breakAlliance: (target: string): void => breakAllianceFromUi(target, deps),
  breakTruce: (targetPlayerId: string): void => breakTruceFromUi(targetPlayerId, deps),
  chooseTech: (techIdRaw?: string): void => chooseTechFromUi(techIdRaw, deps),
  chooseDomain: (domainIdRaw?: string): void => chooseDomainFromUi(domainIdRaw, deps)
});
