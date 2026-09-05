import {
  MAX_TRUCE_BREAKS_PER_PLAYER,
  type SocialActiveTruce,
  type SocialAllianceBreak,
  type SocialAllianceRequest,
  type SocialCompletedAllianceBreak,
  type SocialTruceBreakRecord,
  type SocialTruceRequest
} from "../social-state/social-state.js";

export type SocialStoreSnapshot = {
  players: Array<{ id: string; name: string; allies: string[] }>;
  // Same pairs as players[].allies, with `createdAt` -- feeds GET /api/activity's `since` (social-activity-views.ts).
  allianceRecords: Array<{ playerAId: string; playerBId: string; createdAt: number }>;
  allianceRequests: SocialAllianceRequest[];
  activeAllianceBreaks: SocialAllianceBreak[];
  completedAllianceBreaks: SocialCompletedAllianceBreak[];
  truceRequests: SocialTruceRequest[];
  activeTruces: SocialActiveTruce[];
  truceLockouts: Array<{ playerId: string; lockoutUntil: number }>;
  truceBreaks: Array<{ playerId: string } & SocialTruceBreakRecord>;
};

export type GatewaySocialStore = {
  loadSnapshot(): SocialStoreSnapshot;
  upsertPlayer(playerId: string, name: string): void;
  saveAllianceRequest(request: SocialAllianceRequest): void;
  deleteAllianceRequest(requestId: string): void;
  saveAllianceBreak(notice: SocialAllianceBreak): void;
  removeAllianceBreak(playerAId: string, playerBId: string): void;
  saveCompletedAllianceBreak(notice: SocialCompletedAllianceBreak): void;
  removeCompletedAllianceBreak(playerAId: string, playerBId: string): void;
  saveTruceRequest(request: SocialTruceRequest): void;
  deleteTruceRequest(requestId: string): void;
  addAlliance(playerAId: string, playerBId: string, createdAt: number): void;
  removeAlliance(playerAId: string, playerBId: string): void;
  saveActiveTruce(truce: SocialActiveTruce): void;
  removeActiveTruce(playerAId: string, playerBId: string): void;
  saveTruceLockout(playerId: string, lockoutUntil: number): void;
  saveTruceBreak(playerId: string, record: SocialTruceBreakRecord): void;
  pruneExpired(now: number): void;
  clearSeasonData(): void;
};

export const orderedPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export const pairKey = (a: string, b: string): string => {
  const [first, second] = orderedPair(a, b);
  return `${first}:${second}`;
};

export class InMemoryGatewaySocialStore implements GatewaySocialStore {
  private readonly players = new Map<string, { name: string; updatedAt: number }>();
  private readonly alliances = new Map<string, { aId: string; bId: string; createdAt: number }>();
  private readonly allianceRequests = new Map<string, SocialAllianceRequest>();
  private readonly activeAllianceBreaks = new Map<string, SocialAllianceBreak>();
  private readonly completedAllianceBreaks = new Map<string, SocialCompletedAllianceBreak>();
  private readonly truceRequests = new Map<string, SocialTruceRequest>();
  private readonly activeTruces = new Map<string, SocialActiveTruce>();
  private readonly truceLockouts = new Map<string, number>();
  private readonly truceBreaks: Array<{ playerId: string } & SocialTruceBreakRecord> = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  loadSnapshot(): SocialStoreSnapshot {
    const alliesByPlayer = new Map<string, Set<string>>();
    for (const entry of this.alliances.values()) {
      if (!alliesByPlayer.has(entry.aId)) alliesByPlayer.set(entry.aId, new Set());
      if (!alliesByPlayer.has(entry.bId)) alliesByPlayer.set(entry.bId, new Set());
      alliesByPlayer.get(entry.aId)!.add(entry.bId);
      alliesByPlayer.get(entry.bId)!.add(entry.aId);
    }
    return {
      players: [...this.players.entries()].map(([id, { name }]) => ({
        id,
        name,
        allies: [...(alliesByPlayer.get(id) ?? [])]
      })),
      allianceRecords: [...this.alliances.values()].map(({ aId, bId, createdAt }) => ({ playerAId: aId, playerBId: bId, createdAt })),
      allianceRequests: [...this.allianceRequests.values()].map((r) => ({ ...r })),
      activeAllianceBreaks: [...this.activeAllianceBreaks.values()].map((notice) => ({ ...notice })),
      completedAllianceBreaks: [...this.completedAllianceBreaks.values()].map((notice) => ({ ...notice })),
      truceRequests: [...this.truceRequests.values()].map((r) => ({ ...r })),
      activeTruces: [...this.activeTruces.values()].map((t) => ({ ...t })),
      truceLockouts: [...this.truceLockouts.entries()].map(([playerId, lockoutUntil]) => ({ playerId, lockoutUntil })),
      truceBreaks: this.truceBreaks.map((record) => ({ ...record }))
    };
  }

  upsertPlayer(playerId: string, name: string): void {
    this.players.set(playerId, { name, updatedAt: this.now() });
  }

  saveAllianceRequest(request: SocialAllianceRequest): void {
    this.allianceRequests.set(request.id, { ...request });
  }

  deleteAllianceRequest(requestId: string): void {
    this.allianceRequests.delete(requestId);
  }

  saveAllianceBreak(notice: SocialAllianceBreak): void {
    this.activeAllianceBreaks.set(pairKey(notice.playerAId, notice.playerBId), { ...notice });
  }

  removeAllianceBreak(playerAId: string, playerBId: string): void {
    this.activeAllianceBreaks.delete(pairKey(playerAId, playerBId));
  }

  saveCompletedAllianceBreak(notice: SocialCompletedAllianceBreak): void {
    this.completedAllianceBreaks.set(pairKey(notice.playerAId, notice.playerBId), { ...notice });
  }

  removeCompletedAllianceBreak(playerAId: string, playerBId: string): void {
    this.completedAllianceBreaks.delete(pairKey(playerAId, playerBId));
  }

  saveTruceRequest(request: SocialTruceRequest): void {
    this.truceRequests.set(request.id, { ...request });
  }

  deleteTruceRequest(requestId: string): void {
    this.truceRequests.delete(requestId);
  }

  addAlliance(playerAId: string, playerBId: string, createdAt: number): void {
    const [aId, bId] = orderedPair(playerAId, playerBId);
    this.alliances.set(pairKey(aId, bId), { aId, bId, createdAt });
  }

  removeAlliance(playerAId: string, playerBId: string): void {
    this.alliances.delete(pairKey(playerAId, playerBId));
  }

  saveActiveTruce(truce: SocialActiveTruce): void {
    this.activeTruces.set(pairKey(truce.playerAId, truce.playerBId), { ...truce });
  }

  removeActiveTruce(playerAId: string, playerBId: string): void {
    this.activeTruces.delete(pairKey(playerAId, playerBId));
  }

  saveTruceLockout(playerId: string, lockoutUntil: number): void {
    this.truceLockouts.set(playerId, lockoutUntil);
  }

  saveTruceBreak(playerId: string, record: SocialTruceBreakRecord): void {
    this.truceBreaks.push({ playerId, ...record });
    const forPlayer = this.truceBreaks.filter((entry) => entry.playerId === playerId);
    if (forPlayer.length > MAX_TRUCE_BREAKS_PER_PLAYER) {
      const dropCount = forPlayer.length - MAX_TRUCE_BREAKS_PER_PLAYER;
      let dropped = 0;
      for (let i = 0; i < this.truceBreaks.length && dropped < dropCount; ) {
        if (this.truceBreaks[i]!.playerId === playerId) {
          this.truceBreaks.splice(i, 1);
          dropped += 1;
        } else {
          i += 1;
        }
      }
    }
  }

  pruneExpired(now: number): void {
    for (const [id, request] of this.truceRequests) {
      if (request.expiresAt <= now) this.truceRequests.delete(id);
    }
    for (const [key, truce] of this.activeTruces) {
      if (truce.endsAt <= now) this.activeTruces.delete(key);
    }
    for (const [key, notice] of this.completedAllianceBreaks) {
      if (notice.notificationExpiresAt <= now) this.completedAllianceBreaks.delete(key);
    }
    for (const [playerId, lockoutUntil] of this.truceLockouts) {
      if (lockoutUntil <= now) this.truceLockouts.delete(playerId);
    }
  }

  clearSeasonData(): void {
    this.alliances.clear();
    this.allianceRequests.clear();
    this.activeAllianceBreaks.clear();
    this.completedAllianceBreaks.clear();
    this.truceRequests.clear();
    this.activeTruces.clear();
    this.truceLockouts.clear();
    this.truceBreaks.length = 0;
  }
}

export { SqliteGatewaySocialStore } from "./social-store-sqlite.js";
