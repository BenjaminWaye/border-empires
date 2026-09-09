// Builds the SocialStateSink adapter over a GatewaySocialStore, extracted
// out of gateway-app.ts (already well over the repo's 500-line file-size gate
// and may not grow further -- see AGENTS.md's file-and-type-discipline rule).
import type { GatewaySocialStore } from "../social-store/social-store.js";
import type { SocialStateSink } from "../social-state/social-state.js";

export const buildSocialStateSink = (socialStore: GatewaySocialStore): SocialStateSink => ({
  upsertPlayer: (playerId, name) => socialStore.upsertPlayer(playerId, name),
  saveAllianceRequest: (request) => socialStore.saveAllianceRequest(request),
  deleteAllianceRequest: (requestId) => socialStore.deleteAllianceRequest(requestId),
  saveTruceRequest: (request) => socialStore.saveTruceRequest(request),
  deleteTruceRequest: (requestId) => socialStore.deleteTruceRequest(requestId),
  addAlliance: (playerAId, playerBId, createdAt) => socialStore.addAlliance(playerAId, playerBId, createdAt),
  removeAlliance: (playerAId, playerBId) => socialStore.removeAlliance(playerAId, playerBId),
  saveAllianceBreak: (notice) => socialStore.saveAllianceBreak(notice),
  removeAllianceBreak: (playerAId, playerBId) => socialStore.removeAllianceBreak(playerAId, playerBId),
  saveCompletedAllianceBreak: (notice) => socialStore.saveCompletedAllianceBreak(notice),
  removeCompletedAllianceBreak: (playerAId, playerBId) => socialStore.removeCompletedAllianceBreak(playerAId, playerBId),
  saveActiveTruce: (truce) => socialStore.saveActiveTruce(truce),
  removeActiveTruce: (playerAId, playerBId) => socialStore.removeActiveTruce(playerAId, playerBId),
  saveTruceLockout: (playerId, lockoutUntil) => socialStore.saveTruceLockout(playerId, lockoutUntil),
  saveTruceBreak: (playerId, record) => socialStore.saveTruceBreak(playerId, record),
  pruneExpired: (now) => socialStore.pruneExpired(now)
});
