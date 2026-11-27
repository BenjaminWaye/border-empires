// Restores createSocialState's maps from the persisted social store
// (SocialStateInitial), extracted out of social-state.ts to keep that file
// under the repo's 500-line cap.
import { aiNameFromStored, type AllianceFealty } from "@border-empires/shared";

import {
  pairKey,
  type SocialActiveTruce,
  type SocialAllianceBreak,
  type SocialAllianceRequest,
  type SocialCompletedAllianceBreak,
  type SocialPlayerRecord,
  type SocialStateInitial,
  type SocialTruceBreakRecord,
  type SocialTruceRequest
} from "./social-state-types.js";

export type SocialStateMaps = {
  ensurePlayer: (playerId: string, fallbackName?: string) => SocialPlayerRecord;
  allianceRequests: Map<string, SocialAllianceRequest>;
  allianceFealtyByPair: Map<string, AllianceFealty>;
  allianceBreaksByPair: Map<string, SocialAllianceBreak>;
  completedAllianceBreaks: Map<string, SocialCompletedAllianceBreak>;
  truceRequests: Map<string, SocialTruceRequest>;
  trucesByPair: Map<string, SocialActiveTruce>;
  truceLockoutUntilByPlayerId: Map<string, number>;
  truceBreaksByPlayerId: Map<string, SocialTruceBreakRecord[]>;
  maxTruceBreaksPerPlayer: number;
};

export const loadSocialStateInitial = (initial: SocialStateInitial, maps: SocialStateMaps): void => {
  for (const player of initial.players ?? []) {
    // A saved "AI 13" predates AIs using their listed names: restore the real one.
    const name = aiNameFromStored(player.id, player.name) ?? player.name;
    const record = maps.ensurePlayer(player.id, name);
    record.name = name;
    for (const allyId of player.allies ?? []) record.allies.add(allyId);
  }
  for (const alliance of initial.allianceRecords ?? []) {
    if (alliance.fealty) maps.allianceFealtyByPair.set(pairKey(alliance.playerAId, alliance.playerBId), { ...alliance.fealty });
  }
  for (const request of initial.allianceRequests ?? []) {
    maps.allianceRequests.set(request.id, { ...request });
  }
  for (const notice of initial.activeAllianceBreaks ?? []) {
    maps.allianceBreaksByPair.set(pairKey(notice.playerAId, notice.playerBId), { ...notice });
  }
  for (const notice of initial.completedAllianceBreaks ?? []) {
    maps.completedAllianceBreaks.set(pairKey(notice.playerAId, notice.playerBId), { ...notice });
  }
  for (const request of initial.truceRequests ?? []) {
    maps.truceRequests.set(request.id, { ...request });
  }
  for (const truce of initial.activeTruces ?? []) {
    maps.trucesByPair.set(pairKey(truce.playerAId, truce.playerBId), { ...truce });
  }
  for (const lockout of initial.truceLockouts ?? []) {
    maps.truceLockoutUntilByPlayerId.set(lockout.playerId, lockout.lockoutUntil);
  }
  for (const { playerId, ...record } of initial.truceBreaks ?? []) {
    const existing = maps.truceBreaksByPlayerId.get(playerId) ?? [];
    existing.push(record);
    if (existing.length > maps.maxTruceBreaksPerPlayer) existing.splice(0, existing.length - maps.maxTruceBreaksPerPlayer);
    maps.truceBreaksByPlayerId.set(playerId, existing);
  }
};
