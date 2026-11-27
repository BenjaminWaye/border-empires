import { describe, expect, it } from "vitest";
import { PASSIVE_INCOME_INACTIVITY_CAP_MS } from "@border-empires/game-domain";
import { SimulationRuntime } from "../runtime/runtime.js";
import { noteAwayFlagDraw, noteAwayManpowerRefill, readAwayLedger } from "./welcome-back-ledger.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const human = (id: string, lastActiveAt?: number) => ({
  id,
  ...(lastActiveAt === undefined ? {} : { lastActiveAt }),
  isAi: false,
  points: 0,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }
});

const goldTown = (ownerId: string) => ({
  x: 5,
  y: 5,
  terrain: "LAND" as const,
  ownerId,
  ownershipState: "SETTLED" as const,
  town: { type: "FARMING" as const, populationTier: "SETTLEMENT" as const, name: "Gold Town" }
});

const runtimeAt = (clock: { now: number }, lastActiveAt?: number) =>
  new SimulationRuntime({
    now: () => clock.now,
    initialPlayers: new Map([["p1", human("p1", lastActiveAt)]]),
    seedTiles: new Map(),
    initialState: { tiles: [goldTown("p1")], activeLocks: [] }
  });

const playerOf = (runtime: SimulationRuntime) => (runtime as unknown as { state: { players: Map<string, object> } }).state.players.get("p1")!;

describe("welcome-back summary", () => {
  // Playtest Run 5: coin jumped on return with no explanation. The summary
  // measured from the last 15s income tick, so it never reached its 60s
  // threshold and the WELCOME_BACK message was never sent.
  it("reports the coin the income tick paid since the player's last command", () => {
    const clock = { now: 1_000_000 };
    const runtime = runtimeAt(clock);
    runtime.updatePlayerLastActive("p1", clock.now);
    runtime.applyPassiveIncome(clock.now, PASSIVE_INCOME_INACTIVITY_CAP_MS);
    const before = runtime.exportState().players.find((p) => p.id === "p1")!.points;
    // Ticks every 15s while the player is away, as the live service does.
    for (let t = clock.now + 15_000; t <= clock.now + 2 * HOUR; t += 15_000) runtime.applyPassiveIncome(t, PASSIVE_INCOME_INACTIVITY_CAP_MS);
    const earned = runtime.exportState().players.find((p) => p.id === "p1")!.points - before;
    expect(earned).toBeGreaterThan(0);

    const summary = runtime.welcomeBackSummary("p1", clock.now + 2 * HOUR);
    expect(summary.elapsedMs).toBe(2 * HOUR);
    expect(summary.goldEarned).toBe(Math.floor(earned));
    expect(summary.incomeCapped).toBe(false);
  });

  it("counts refills and flag draws, flags the 24h income limit, and clears on the next command", () => {
    const clock = { now: 5_000_000 };
    const runtime = runtimeAt(clock);
    runtime.updatePlayerLastActive("p1", clock.now);
    const player = playerOf(runtime);
    noteAwayManpowerRefill(player, 300.4, clock.now + HOUR);
    noteAwayFlagDraw(player, 120.9, clock.now + HOUR);
    noteAwayFlagDraw(player, -5, clock.now + HOUR);

    const later = clock.now + PASSIVE_INCOME_INACTIVITY_CAP_MS + HOUR;
    const summary = runtime.welcomeBackSummary("p1", later);
    expect(summary).toMatchObject({ manpowerRefilled: 300, flagsDrawn: 120, incomeCapped: true });

    runtime.updatePlayerLastActive("p1", later);
    expect(readAwayLedger(player)).toMatchObject({ since: later, coin: 0, manpowerRefilled: 0, flagsDrawn: 0 });
  });

  it("estimates coin at the current rate, at most 24h of it, when a restart cut the ledger short", () => {
    const clock = { now: 9_000_000 };
    // Booted from a snapshot with the last command saved but no ledger: it starts at the first credit after boot.
    const runtime = runtimeAt(clock, clock.now);
    const player = playerOf(runtime);
    noteAwayFlagDraw(player, 10, clock.now + 30 * HOUR);
    const summary = runtime.welcomeBackSummary("p1", clock.now + 30 * HOUR, 2);
    expect(summary.goldEarned).toBe(Math.floor(2 * (PASSIVE_INCOME_INACTIVITY_CAP_MS / MINUTE)));
    expect(summary.incomeCapped).toBe(true);
  });

  it("says nothing for an absence under a minute", () => {
    const clock = { now: 2_000_000 };
    const runtime = runtimeAt(clock);
    runtime.updatePlayerLastActive("p1", clock.now);
    expect(runtime.welcomeBackSummary("p1", clock.now + 30_000)).toMatchObject({ goldEarned: 0, manpowerRefilled: 0, flagsDrawn: 0 });
  });
});
