import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "./runtime.js";
import { applySimulationEventsToRecoveredState, type RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { encodeReachBorder } from "../reach-border-snapshot/reach-border-snapshot.js";

// Regression: the reach border used to be rebuilt from anchors on every boot,
// replaying them in player order. Where two players' reach overlapped, a
// restart handed the overlap to whichever player came first -- even when the
// other player had claimed it first and still defended it. A player saw their
// reach "move" onto a rival overnight. The border is now persisted.

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 100_000,
  manpower: 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const beacon = (x: number, ownerId: string) => ({
  x,
  y: 10,
  terrain: "LAND" as const,
  ownerId,
  ownershipState: "SETTLED" as const,
  economicStructure: { ownerId, type: "RELAY_BEACON" as const, status: "active" as const }
});

// Beacons reach 5 tiles: elin's (x=5) covers x 0..10, mine (x=13) covers
// x 8..18, so x 8..10 is covered by both.
const OVERLAP = ["8,10", "9,10", "10,10"];

const worldWith = (extra: Partial<RecoveredSimulationState> = {}): RecoveredSimulationState => {
  const tiles: RecoveredSimulationState["tiles"] = [];
  for (let x = 0; x <= 24; x += 1) {
    for (let y = 4; y <= 16; y += 1) {
      if ((x === 5 || x === 13) && y === 10) continue;
      tiles.push({ x, y, terrain: "LAND" });
    }
  }
  tiles.push(beacon(5, "elin"), beacon(13, "me"));
  return { tiles, activeLocks: [], ...extra };
};

// Elin is first in player order: an anchor-order rebuild hands her the overlap.
const boot = (initialState: RecoveredSimulationState): SimulationRuntime =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["elin", makePlayer("elin")], ["me", makePlayer("me")]]),
    seedTiles: new Map(),
    initialState
  });

const reachOf = (runtime: SimulationRuntime, playerId: string): Set<string> => new Set(runtime.reachTileKeysForPlayer(playerId));

/** The border as it stood live: I claimed the overlap before Elin's beacon came up. */
const persistedBorderWhereIHoldTheOverlap = () => {
  const border = new Map<string, string>();
  for (let x = 0; x <= 7; x += 1) border.set(`${x},10`, "elin");
  for (let x = 8; x <= 18; x += 1) border.set(`${x},10`, "me");
  return encodeReachBorder(border);
};

describe("SimulationRuntime — reach border survives a restart", () => {
  it("keeps an overlap with the player who held it, not whoever's anchors replay first", () => {
    const runtime = boot(worldWith({ reachBorder: persistedBorderWhereIHoldTheOverlap() }));

    for (const key of OVERLAP) expect(reachOf(runtime, "me").has(key)).toBe(true);
    for (const key of OVERLAP) expect(reachOf(runtime, "elin").has(key)).toBe(false);
  });

  it("round-trips through a checkpoint: export, restart, same border", () => {
    const first = boot(worldWith({ reachBorder: persistedBorderWhereIHoldTheOverlap() }));
    const sections = first.exportSnapshotSections();
    const second = boot(sections.initialState);

    expect(reachOf(second, "me")).toEqual(reachOf(first, "me"));
    expect(reachOf(second, "elin")).toEqual(reachOf(first, "elin"));
  });

  it("recovers changes made after the last checkpoint from REACH_BORDER_CHANGED events", async () => {
    const live = boot(worldWith({ reachBorder: persistedBorderWhereIHoldTheOverlap() }));
    const checkpoint = live.exportSnapshotSections().initialState;
    const events: SimulationEvent[] = [];
    live.onEvent((event) => events.push(event));

    // My beacon goes dark: Elin's live reach takes the overlap, my own-only ground is vacated.
    live.submitCommand({
      commandId: "disable-my-beacon",
      sessionId: "session-1",
      playerId: "me",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SET_CONVERTER_STRUCTURE_ENABLED",
      payloadJson: JSON.stringify({ x: 13, y: 10, enabled: false })
    });
    await Promise.resolve();
    expect(events.some((event) => event.eventType === "REACH_BORDER_CHANGED")).toBe(true);

    // "Crash" before the next checkpoint: recover from the old checkpoint + the event tail.
    const recovered = boot(applySimulationEventsToRecoveredState(checkpoint, events));

    expect(reachOf(recovered, "elin")).toEqual(reachOf(live, "elin"));
    expect(reachOf(recovered, "me")).toEqual(reachOf(live, "me"));
    for (const key of OVERLAP) expect(reachOf(recovered, "elin").has(key)).toBe(true);
  });

  it("drops persisted reach the owner no longer covers with a live anchor", () => {
    const border = new Map([["20,10", "me"], ["24,16", "me"]]); // 24,16 is outside my beacon's disk
    const runtime = boot(worldWith({ reachBorder: encodeReachBorder(border) }));

    expect(reachOf(runtime, "me").has("20,10")).toBe(false); // 20 > 13 + 5
    expect(reachOf(runtime, "me").has("24,16")).toBe(false);
  });

  it("with no persisted border (old snapshot), gives an overlap tile to the player who owns it", () => {
    const tiles = worldWith().tiles.map((tile) =>
      OVERLAP.includes(`${tile.x},${tile.y}`) ? { ...tile, ownerId: "me", ownershipState: "FRONTIER" as const } : tile
    );
    const runtime = boot({ tiles, activeLocks: [] });

    for (const key of OVERLAP) expect(reachOf(runtime, "me").has(key)).toBe(true);
  });
});
