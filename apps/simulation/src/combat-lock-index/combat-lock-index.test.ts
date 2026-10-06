import { describe, expect, it } from "vitest";
import { CombatLockIndex } from "./combat-lock-index.js";
import type { LockRecord } from "../runtime-types.js";

const lock = (commandId: string, originKey: string, targetKey: string): LockRecord => ({
  commandId, playerId: "p", actionType: "ATTACK", manpowerCost: 0,
  originX: 0, originY: 0, targetX: 0, targetY: 0, originKey, targetKey,
  resolvesAt: 1, source: "player"
});

describe("CombatLockIndex", () => {
  it("lets one tile be the origin of many fights but the target of only one", () => {
    const index = new CombatLockIndex();
    const a = lock("a", "o", "t1");
    const b = lock("b", "o", "t2");
    index.addLock(a);
    index.addLock(b);
    expect(index.originLocksAt("o").map((l) => l.commandId).sort()).toEqual(["a", "b"]);
    expect(index.targetLockAt("o")).toBeUndefined();
    expect(index.targetLockAt("t1")).toBe(a);
    expect([...index.values()]).toHaveLength(2);
  });

  it("has() and keys() cover both roles, each tile once", () => {
    const index = new CombatLockIndex();
    index.addLock(lock("a", "x", "y"));
    index.addLock(lock("b", "z", "x"));
    expect(index.has("x") && index.has("y") && index.has("z")).toBe(true);
    expect(index.has("nope")).toBe(false);
    expect([...index.keys()].sort()).toEqual(["x", "y", "z"]);
  });

  it("removeLock leaves other locks sharing the origin and does not free a target slot it lost", () => {
    const index = new CombatLockIndex();
    const a = lock("a", "o", "t");
    const supersedingB = lock("b", "o2", "t");
    index.addLock(a);
    index.addLock(supersedingB);
    expect(index.ownsTargetSlot(a)).toBe(false);
    index.removeLock(a);
    expect(index.targetLockAt("t")).toBe(supersedingB);
    expect(index.originLocksAt("o")).toEqual([]);
    index.removeLock(supersedingB);
    expect([...index.keys()]).toEqual([]);
  });

  it("re-adding a command replaces its previous entry", () => {
    const index = new CombatLockIndex();
    index.addLock(lock("a", "o", "t1"));
    index.addLock(lock("a", "o", "t2"));
    expect([...index.values()]).toHaveLength(1);
    expect(index.targetLockAt("t1")).toBeUndefined();
    expect(index.targetLockAt("t2")?.commandId).toBe("a");
  });

  describe("onAttackTargetReleased", () => {
    it("fires once an ATTACK lock stops targeting its tile, however it was removed", () => {
      const index = new CombatLockIndex();
      const released: string[] = [];
      index.onAttackTargetReleased((l) => released.push(l.commandId));
      const a = lock("a", "o", "t");
      index.addLock(a);
      expect(released).toEqual([]);
      index.removeLock(a);
      expect(released).toEqual(["a"]);
    });

    it("does not fire for EXPAND locks or for a lock that no longer owns its target slot", () => {
      const index = new CombatLockIndex();
      const released: string[] = [];
      index.onAttackTargetReleased((l) => released.push(l.commandId));
      const expand: LockRecord = { ...lock("e", "o", "t1"), actionType: "EXPAND" };
      index.addLock(expand);
      index.removeLock(expand);

      const stale = lock("stale", "o", "t2");
      index.addLock(stale);
      index.addLock({ ...lock("fresh", "o2", "t2") });
      index.removeLock(stale); // fresh owns t2 now; removing the stale one must not "release" t2
      expect(released).toEqual([]);
      expect(index.targetLockAt("t2")?.commandId).toBe("fresh");
    });

    it("fires after the index is consistent (the tile reads as unlocked inside the callback)", () => {
      const index = new CombatLockIndex();
      let lockedInsideCallback: boolean | undefined;
      index.onAttackTargetReleased((l) => { lockedInsideCallback = index.targetLockAt(l.targetKey) !== undefined; });
      const a = lock("a", "o", "t");
      index.addLock(a);
      index.removeLock(a);
      expect(lockedInsideCallback).toBe(false);
    });
  });
});
