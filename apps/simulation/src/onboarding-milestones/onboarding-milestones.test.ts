import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type { OnboardingMilestonePayload, SimulationEvent } from "@border-empires/sim-protocol";

import { simulationTileKey } from "../seed-state/seed-state.js";
import { ONBOARDING_SCAN_THROTTLE_MS, createOnboardingMilestoneTracker } from "./onboarding-milestones.js";

const player = (id: string, isAi = false): DomainPlayer => ({ id, isAi }) as DomainPlayer;

const setup = () => {
  let now = 1_000_000;
  const players = new Map<string, DomainPlayer>([
    ["human-a", player("human-a")],
    ["human-b", player("human-b")],
    ["ai-1", player("ai-1", true)],
    // barbarian-1 is isAi:false in the real runtime too.
    ["barbarian-1", player("barbarian-1")]
  ]);
  const tiles = new Map<string, DomainTileState>();
  const territory = new Map<string, Set<string>>();
  const events: SimulationEvent[] = [];
  const own = (x: number, y: number, ownerId: string): void => {
    const key = simulationTileKey(x, y);
    const previous = tiles.get(key)?.ownerId;
    if (previous) territory.get(previous)?.delete(key);
    tiles.set(key, { x, y, ownerId } as DomainTileState);
    if (!territory.has(ownerId)) territory.set(ownerId, new Set());
    territory.get(ownerId)!.add(key);
  };
  const tracker = createOnboardingMilestoneTracker({
    now: () => now,
    players: () => players,
    tiles: () => tiles,
    territoryTileKeys: (id) => territory.get(id) ?? new Set(),
    emitEvent: (event) => events.push(event)
  });
  const flip = (x: number, y: number, ownerId: string): void => {
    own(x, y, ownerId);
    tracker.observeTileFlip({ x, y, toOwner: ownerId });
  };
  const milestones = () =>
    events.map((event) => {
      if (event.eventType !== "PLAYER_MESSAGE") throw new Error("unexpected event");
      return { playerId: event.playerId, ...(JSON.parse(event.payloadJson) as OnboardingMilestonePayload) };
    });
  return { own, flip, milestones, tracker, advance: (ms: number) => { now += ms; } };
};

describe("onboarding milestones", () => {
  it("reports TEN_TILES once when a human reaches ten owned tiles", () => {
    const t = setup();
    for (let x = 0; x < 9; x += 1) { t.flip(x, 0, "human-a"); t.advance(ONBOARDING_SCAN_THROTTLE_MS); }
    expect(t.milestones()).toEqual([]);
    t.flip(9, 0, "human-a");
    t.advance(ONBOARDING_SCAN_THROTTLE_MS);
    t.flip(10, 0, "human-a");
    expect(t.milestones()).toEqual([expect.objectContaining({ playerId: "human-a", kind: "TEN_TILES", ownedTiles: 10 })]);
  });

  it("catches tiles gained without a flip on the player's next flip", () => {
    const t = setup();
    for (let x = 0; x < 12; x += 1) t.own(x, 5, "human-a"); // e.g. auto-fill
    t.flip(20, 20, "human-a");
    expect(t.milestones().map((m) => m.kind)).toEqual(["TEN_TILES"]);
  });

  it("reports FIRST_CONTACT for both humans when borders touch, tagging the partner", () => {
    const t = setup();
    t.flip(0, 0, "human-a");
    t.flip(2, 0, "human-b");
    expect(t.milestones()).toEqual([]);
    t.flip(1, 0, "human-a");
    expect(t.milestones()).toEqual([
      expect.objectContaining({ playerId: "human-a", kind: "FIRST_CONTACT", withPlayerId: "human-b", withIsAi: false }),
      expect.objectContaining({ playerId: "human-b", kind: "FIRST_CONTACT", withPlayerId: "human-a", withIsAi: false })
    ]);
    t.advance(ONBOARDING_SCAN_THROTTLE_MS);
    t.flip(1, 1, "human-a");
    expect(t.milestones()).toHaveLength(2);
  });

  it("counts AI neighbours (tagged) but never reports for the AI itself", () => {
    const t = setup();
    t.flip(0, 0, "human-a");
    t.flip(1, 0, "ai-1");
    expect(t.milestones()).toEqual([expect.objectContaining({ playerId: "human-a", kind: "FIRST_CONTACT", withPlayerId: "ai-1", withIsAi: true })]);
  });

  it("ignores barbarians on either side", () => {
    const t = setup();
    t.flip(0, 0, "human-a");
    t.flip(1, 0, "barbarian-1");
    t.advance(ONBOARDING_SCAN_THROTTLE_MS);
    t.flip(0, 1, "human-a");
    expect(t.milestones()).toEqual([]);
  });

  it("finds contact made elsewhere in the territory on a later scan", () => {
    const t = setup();
    t.own(50, 50, "human-b");
    t.own(51, 50, "human-a"); // bordering tile gained without a flip
    t.flip(0, 0, "human-a");
    expect(t.milestones()).toEqual([
      expect.objectContaining({ playerId: "human-a", kind: "FIRST_CONTACT", withPlayerId: "human-b" }),
      expect.objectContaining({ playerId: "human-b", kind: "FIRST_CONTACT", withPlayerId: "human-a" })
    ]);
  });

  it("throttles full-territory scans per player", () => {
    const t = setup();
    t.flip(0, 0, "human-a");
    t.flip(5, 5, "human-a");
    expect(t.tracker.gauge().scans).toBe(1);
    t.advance(ONBOARDING_SCAN_THROTTLE_MS);
    t.flip(6, 5, "human-a");
    expect(t.tracker.gauge().scans).toBe(2);
  });
});
