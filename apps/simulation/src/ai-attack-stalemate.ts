// Detects "attacked the same target for too long without flipping it" so the
// planner can fall through to SETTLE/EXPAND/BUILD instead of single-mindedly
// hammering one frontier forever. Without this, an AI under any hostile
// contact stays locked in ATTACK mode (automation-command-planner.ts:610-624
// gates ATTACK ahead of SETTLE), which a human can exploit by parking a
// single unbreakable unit on the AI's border to lobotomise the rest of its
// economy.

// Per attempt threshold: when an AI has attacked the same target tile this
// many times within the rolling window, the target is considered stalemated
// and the planner skips it for ATTACK consideration.
export const ATTACK_STALEMATE_ATTEMPTS_THRESHOLD = 20;

// How long an entry stays in the tracker. After the window, the entry is
// pruned and the AI is allowed to retry — giving up forever would be too
// harsh since map state changes (allies arriving, tech unlocks) can make a
// previously-stuck attack newly viable.
export const ATTACK_STALEMATE_WINDOW_MS = 20 * 60 * 1000; // 20 min

type AttackAttemptRecord = {
  attempts: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
};

export type AttackStalemateTracker = {
  recordAttempt: (playerId: string, targetTileKey: string, nowMs: number) => void;
  clearTarget: (targetTileKey: string) => void;
  expireOlderThan: (cutoffMs: number) => void;
  stalemateTargetsForPlayer: (playerId: string) => string[];
  size: () => number;
};

const compositeKey = (playerId: string, targetTileKey: string): string =>
  `${playerId}::${targetTileKey}`;

const splitKey = (key: string): { playerId: string; targetTileKey: string } | undefined => {
  const idx = key.indexOf("::");
  if (idx < 0) return undefined;
  return { playerId: key.slice(0, idx), targetTileKey: key.slice(idx + 2) };
};

export const createAttackStalemateTracker = (): AttackStalemateTracker => {
  const records = new Map<string, AttackAttemptRecord>();

  return {
    recordAttempt(playerId, targetTileKey, nowMs): void {
      const key = compositeKey(playerId, targetTileKey);
      const existing = records.get(key);
      if (!existing) {
        records.set(key, { attempts: 1, firstAttemptAt: nowMs, lastAttemptAt: nowMs });
        return;
      }
      // Window-rolled: if last attempt was longer than the window ago, reset
      // the counter so we don't carry decades-old grudges.
      if (nowMs - existing.lastAttemptAt > ATTACK_STALEMATE_WINDOW_MS) {
        records.set(key, { attempts: 1, firstAttemptAt: nowMs, lastAttemptAt: nowMs });
        return;
      }
      existing.attempts += 1;
      existing.lastAttemptAt = nowMs;
    },
    clearTarget(targetTileKey): void {
      for (const key of [...records.keys()]) {
        const parsed = splitKey(key);
        if (parsed && parsed.targetTileKey === targetTileKey) records.delete(key);
      }
    },
    expireOlderThan(cutoffMs): void {
      for (const [key, record] of records.entries()) {
        if (record.lastAttemptAt <= cutoffMs) records.delete(key);
      }
    },
    stalemateTargetsForPlayer(playerId): string[] {
      const out: string[] = [];
      for (const [key, record] of records.entries()) {
        if (record.attempts < ATTACK_STALEMATE_ATTEMPTS_THRESHOLD) continue;
        const parsed = splitKey(key);
        if (parsed?.playerId === playerId) out.push(parsed.targetTileKey);
      }
      return out;
    },
    size(): number {
      return records.size;
    }
  };
};
