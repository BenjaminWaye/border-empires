import { describe, expect, it } from "vitest";

import { SPECTATOR_TILE_DELTA_MESSAGE_TYPE, createRuntimeTileDeltaFanout } from "./tile-delta-fanout-filter.js";

type Delta = { x: number; y: number; ownerId?: string; visibilityState?: "VISIBLE" | "FOG" | "UNSEEN" };

const NO_TRANSITIONS = { entered: new Map<string, ReadonlySet<string>>(), left: new Map<string, ReadonlySet<string>>() };

// Stand-in for the runtime's fog filter: everyone only sees x < 5.
const fanout = createRuntimeTileDeltaFanout<Delta>(() => ({
  filterTileDeltasForPlayer: (deltas) => deltas.filter((delta) => delta.x < 5),
  wireDeltaForTileKey: (tileKey) => {
    const [x, y] = tileKey.split(",").map(Number);
    return { x: x!, y: y! };
  }
}));

const batch: Delta[] = [
  { x: 1, y: 1, ownerId: "ai-1" },
  { x: 300, y: 200, ownerId: "ai-7" }
];

describe("tile-delta fan-out", () => {
  // Regression (docs/load-results/full-reveal-2026-11-23.md): a revealed
  // admin only ever received deltas inside their own vision, so the gateway
  // kept the rest of the map current by re-exporting the whole world on every
  // change, which stalled the server for everyone.
  it("gives each spectator the whole batch as a separate, tagged, unfiltered event", () => {
    const toEvent = (tileDeltas: Delta[]) => ({ player_id: "", event_type: "TILE_DELTA_BATCH", tile_deltas: tileDeltas });

    const events = fanout.spectatorEvents(batch, ["admin", "admin-2"], toEvent);

    expect(events).toEqual(["admin", "admin-2"].map((playerId) => ({
      player_id: playerId,
      event_type: "TILE_DELTA_BATCH",
      message_type: SPECTATOR_TILE_DELTA_MESSAGE_TYPE,
      tile_deltas: [
        { x: 1, y: 1, ownerId: "ai-1", visibilityState: "VISIBLE" },
        { x: 300, y: 200, ownerId: "ai-7", visibilityState: "VISIBLE" }
      ]
    })));
  });

  it("serializes the spectator copy once per batch, and emits nothing without spectators or deltas", () => {
    let serialized = 0;
    const toEvent = (tileDeltas: Delta[]) => { serialized += 1; return { player_id: "", tile_deltas: tileDeltas }; };

    expect(fanout.spectatorEvents(batch, ["a", "b", "c"], toEvent)).toHaveLength(3);
    expect(serialized).toBe(1);
    expect(fanout.spectatorEvents(batch, [], toEvent)).toEqual([]);
    expect(fanout.spectatorEvents([], ["a"], toEvent)).toEqual([]);
  });

  // A spectator keeps their ordinary filtered event too: their fogged sockets
  // and the gateway's snapshot cache must never see the unfiltered copy.
  it("still fog-filters the ordinary event for every subscriber", () => {
    expect(fanout.filter(batch, "admin", NO_TRANSITIONS)).toEqual([{ x: 1, y: 1, ownerId: "ai-1", visibilityState: "VISIBLE" }]);
    const left = { entered: new Map(), left: new Map([["admin", new Set(["2,2"])]]) };
    expect(fanout.filter([], "admin", left)).toEqual([{ x: 2, y: 2, visibilityState: "FOG" }]);
  });
});
