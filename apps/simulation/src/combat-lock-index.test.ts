import { describe, expect, it } from "vitest";
import { CombatLockIndex } from "./combat-lock-index.js";
import type { LockRecord } from "./runtime-types.js";

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
});
