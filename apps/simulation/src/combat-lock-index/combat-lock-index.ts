import type { LockRecord } from "../runtime-types.js";

/**
 * Read side of the combat-lock index, for callers that only ask "is this tile
 * busy?" or walk the live locks.
 */
export interface CombatLockTileReader {
  /** True when the tile is the target OR an origin of any unresolved fight. */
  has(tileKey: string): boolean;
  /** Every tile that is the target or an origin of an unresolved fight. */
  keys(): IterableIterator<string>;
  /** Each unresolved lock exactly once. */
  values(): IterableIterator<LockRecord>;
  /** The one fight (if any) currently contesting this tile as its target. */
  targetLockAt(tileKey: string): LockRecord | undefined;
  /** Fights launched from this tile; a tile can launch any number at once. */
  originLocksAt(tileKey: string): readonly LockRecord[];
}

const NO_LOCKS: readonly LockRecord[] = [];

/**
 * Unresolved combat locks, indexed by the two roles a tile can play:
 *
 *  - **target** -- at most one fight per tile (a tile can only be captured
 *    once), so a second attack on a contested tile is rejected `LOCKED`.
 *  - **origin** -- any number of fights. An attacker may keep launching from
 *    the same tile, and the defender may attack the tile an enemy launched
 *    from. Origin entries never block anything by themselves.
 *
 * This replaces a single `tileKey -> lock` map where a lock was stored under
 * both of its tiles, so a second lock sharing an origin silently overwrote
 * the first lock's slot and the first was then dropped unresolved.
 */
export class CombatLockIndex implements CombatLockTileReader {
  private readonly locksByCommandId = new Map<string, LockRecord>();
  private readonly targets = new Map<string, LockRecord>();
  private readonly origins = new Map<string, Set<LockRecord>>();
  private attackTargetReleasedListener: ((lock: LockRecord) => void) | undefined;

  /**
   * Notified (after the index is consistent again) whenever an ATTACK lock
   * stops contesting its target tile, however it left: resolved, cancelled or
   * swept. Lets the runtime thaw development on the tile (attack-development-hold.ts)
   * without every removal site having to remember to.
   */
  onAttackTargetReleased(listener: ((lock: LockRecord) => void) | undefined): void {
    this.attackTargetReleasedListener = listener;
  }

  addLock(lock: LockRecord): void {
    const existing = this.locksByCommandId.get(lock.commandId);
    if (existing) this.removeLock(existing);
    this.locksByCommandId.set(lock.commandId, lock);
    this.targets.set(lock.targetKey, lock);
    const atOrigin = this.origins.get(lock.originKey);
    if (atOrigin) atOrigin.add(lock);
    else this.origins.set(lock.originKey, new Set([lock]));
  }

  /** True when this lock still owns its target slot (it has not been superseded or swept). */
  ownsTargetSlot(lock: LockRecord): boolean {
    return this.targets.get(lock.targetKey)?.commandId === lock.commandId;
  }

  removeLock(lock: LockRecord): void {
    this.locksByCommandId.delete(lock.commandId);
    const releasedTarget = this.ownsTargetSlot(lock);
    if (releasedTarget) this.targets.delete(lock.targetKey);
    const atOrigin = this.origins.get(lock.originKey);
    if (atOrigin) {
      for (const candidate of atOrigin) {
        if (candidate.commandId === lock.commandId) atOrigin.delete(candidate);
      }
      if (atOrigin.size === 0) this.origins.delete(lock.originKey);
    }
    if (releasedTarget && lock.actionType === "ATTACK") this.attackTargetReleasedListener?.(lock);
  }

  targetLockAt(tileKey: string): LockRecord | undefined {
    return this.targets.get(tileKey);
  }

  originLocksAt(tileKey: string): readonly LockRecord[] {
    const atOrigin = this.origins.get(tileKey);
    return atOrigin ? [...atOrigin] : NO_LOCKS;
  }

  has(tileKey: string): boolean {
    return this.targets.has(tileKey) || this.origins.has(tileKey);
  }

  *keys(): IterableIterator<string> {
    yield* this.targets.keys();
    for (const originKey of this.origins.keys()) {
      if (!this.targets.has(originKey)) yield originKey;
    }
  }

  values(): IterableIterator<LockRecord> {
    return this.locksByCommandId.values();
  }
}
