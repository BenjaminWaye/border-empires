import { describe, expect, it } from "vitest";
import { InMemoryGalaxyBattleLogStore } from "./galaxy-battle-log-store.js";

describe("InMemoryGalaxyBattleLogStore", () => {
  it("records a raid and lists it back", async () => {
    const store = new InMemoryGalaxyBattleLogStore();
    const entry = await store.recordRaid({
      attackerAuthUid: "uid-1",
      defenderAuthUid: "uid-2",
      targetSeasonId: "season-1",
      reconOnly: false,
      damageDealt: 200,
      netDamage: 100,
      stabilityAfter: 0,
      resolvedAt: 1_000
    });
    expect(entry.id).toBeDefined();
    await expect(store.listRecent(10)).resolves.toEqual([entry]);
  });

  it("listRecent returns newest first and respects the limit", async () => {
    const store = new InMemoryGalaxyBattleLogStore();
    for (const resolvedAt of [1_000, 3_000, 2_000]) {
      await store.recordRaid({
        attackerAuthUid: "uid-1",
        defenderAuthUid: "uid-2",
        targetSeasonId: "season-1",
        reconOnly: false,
        damageDealt: 10,
        netDamage: 10,
        stabilityAfter: 90,
        resolvedAt
      });
    }
    const listed = await store.listRecent(2);
    expect(listed.map((e) => e.resolvedAt)).toEqual([3_000, 2_000]);
  });
});
