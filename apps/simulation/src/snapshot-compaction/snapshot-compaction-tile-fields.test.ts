import { describe, expect, it } from "vitest";

import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { mapTile } from "../runtime-snapshot-sections.js";
import { buildWorldgenBaselineIndex, compactSnapshotForStorage, expandSnapshotFromStorage } from "./snapshot-compaction.js";

type RecoveredTile = RecoveredSimulationState["tiles"][number];

const restart = async (baselineTiles: RecoveredTile[], runtimeTiles: RecoveredTile[]): Promise<RecoveredTile[]> => {
  const compact = await compactSnapshotForStorage(
    { initialState: { tiles: runtimeTiles, activeLocks: [] }, commandEvents: [] },
    buildWorldgenBaselineIndex(baselineTiles)
  );
  return expandSnapshotFromStorage(compact, baselineTiles).initialState.tiles;
};

describe("snapshot compaction keeps runtime-mutated tile state across a restart", () => {
  it("keeps an activated waystation activated (regression: every restart re-rolled its reward)", async () => {
    const baseline: RecoveredTile[] = [{ x: 0, y: 0, terrain: "LAND", waystation: { activated: false } }];
    const activated = { activated: true, activatedByPlayerId: "player-1", grantedEffect: "MANPOWER" as const, grantedManpower: 1_000 };
    const [tile] = await restart(baseline, [{ ...baseline[0]!, ownerId: "player-1", ownershipState: "SETTLED", waystation: activated }]);
    expect(tile?.waystation).toEqual(activated);
  });

  it("keeps an activated watchtower activated", async () => {
    const baseline: RecoveredTile[] = [{ x: 0, y: 0, terrain: "LAND", watchtower: { activated: false } }];
    const activated = { activated: true, activatedByPlayerId: "player-1", revealUntil: 123_456 };
    const [tile] = await restart(baseline, [{ ...baseline[0]!, ownerId: "player-1", ownershipState: "FRONTIER", watchtower: activated }]);
    expect(tile?.watchtower).toEqual(activated);
  });

  it("keeps muster flags and frontier decay timers", async () => {
    const baseline: RecoveredTile[] = [{ x: 0, y: 0, terrain: "LAND" }];
    const muster = { ownerId: "player-1", amount: 250, mode: "HOLD" as const, updatedAt: 1_000 };
    const [tile] = await restart(baseline, [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", muster, frontierDecayAt: 99_000, frontierDecayKind: "OUT_OF_REACH" }
    ]);
    expect(tile?.muster).toEqual(muster);
    expect(tile?.frontierDecayAt).toBe(99_000);
    expect(tile?.frontierDecayKind).toBe("OUT_OF_REACH");
  });

  it("round-trips every field the snapshot writer emits (guards against a new tile field missing from the overlay)", async () => {
    const baseline: RecoveredTile[] = [{ x: 0, y: 0, terrain: "LAND" }];
    // Fully populated runtime tile: mapTile decides which fields a snapshot carries.
    const written = mapTile({
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      frontierDecayAt: 5,
      frontierDecayKind: "ENCIRCLEMENT",
      watchtower: { activated: true, activatedByPlayerId: "player-1" },
      waystation: { activated: true, activatedByPlayerId: "player-1", grantedEffect: "GOLD", grantedGold: 50 },
      muster: { ownerId: "player-1", amount: 10, mode: "HOLD", updatedAt: 1 }
    });
    const [tile] = await restart(baseline, [written]);
    expect(tile).toEqual(written);
  });
});
