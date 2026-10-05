import { describe, expect, it } from "vitest";

import { createSimulationMetrics } from "../metrics/metrics.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import type { CommandEnvelope, SimulationEvent, SimulationPersistence } from "../runtime-types.js";
import { InMemorySimulationPersistence } from "../runtime-types.js";
import { samplePersistenceLogMetrics } from "../simulation-service/simulation-service-persistence-log-metrics.js";

const event = (n: number) => ({ eventType: "PLAYER_UPDATE", commandId: `c${n}`, payloadJson: "x" }) as unknown as SimulationEvent;
const command = (n: number) => ({ commandId: `c${n}` }) as unknown as CommandEnvelope;

describe("InMemorySimulationPersistence.stats()", () => {
  it("reports held sizes under the bound and a monotonic evicted counter", () => {
    const persistence = new InMemorySimulationPersistence(100);
    expect(persistence.stats()).toEqual({ commandsHeld: 0, eventsHeld: 0, evictedTotal: 0 });

    let previousEvicted = 0;
    for (let n = 0; n < 10_000; n += 1) {
      persistence.recordEvent(event(n));
      persistence.recordCommand(command(n));
      const { commandsHeld, eventsHeld, evictedTotal } = persistence.stats();
      expect(commandsHeld).toBeLessThan(125);
      expect(eventsHeld).toBeLessThan(125);
      expect(evictedTotal).toBeGreaterThanOrEqual(previousEvicted);
      previousEvicted = evictedTotal;
    }

    const { commandsHeld, eventsHeld, evictedTotal } = persistence.stats();
    expect(commandsHeld).toBeGreaterThanOrEqual(100);
    expect(eventsHeld).toBeGreaterThanOrEqual(100);
    // The counter spans both logs: everything recorded is either still held or evicted.
    expect(evictedTotal + commandsHeld + eventsHeld).toBe(20_000);
    expect(persistence.snapshot().commands).toHaveLength(commandsHeld);
    expect(persistence.snapshot().events).toHaveLength(eventsHeld);
  });

  it("does not count evictions below the cap", () => {
    const persistence = new InMemorySimulationPersistence(100);
    for (let n = 0; n < 50; n += 1) persistence.recordEvent(event(n));
    expect(persistence.stats()).toEqual({ commandsHeld: 0, eventsHeld: 50, evictedTotal: 0 });
  });
});

describe("persistence log gauges", () => {
  it("expose the bound through the runtime, the sampler and the Prometheus output", () => {
    const persistence = new InMemorySimulationPersistence(10);
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      persistence,
      initialPlayers: new Map([["player-1", buildPlayer("player-1")]]),
      initialState: { tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }], activeLocks: [] }
    });
    const metrics = createSimulationMetrics();

    for (let n = 1; n <= 200; n += 1) {
      runtime.submitCommand({
        commandId: `settle-${n}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: n,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x: 10, y: 10 })
      });
    }
    samplePersistenceLogMetrics(runtime, metrics);

    const sample = metrics.snapshot();
    expect(sample.simInMemoryPersistenceCommands).toBeGreaterThanOrEqual(10);
    expect(sample.simInMemoryPersistenceCommands).toBeLessThan(13);
    expect(sample.simInMemoryPersistenceEvents).toBeLessThan(13);
    // 200 commands were recorded: whatever is not still held was evicted (events only add to the counter).
    expect(sample.simInMemoryPersistenceEvictedTotal).toBeGreaterThanOrEqual(200 - sample.simInMemoryPersistenceCommands);
    expect(sample.simInMemoryPersistenceCommands).toBe(persistence.snapshot().commands.length);
    expect(sample.simInMemoryPersistenceEvents).toBe(persistence.snapshot().events.length);

    const exposition = metrics.renderPrometheus();
    expect(exposition).toContain("# TYPE sim_inmemory_persistence_commands gauge");
    expect(exposition).toContain(`sim_inmemory_persistence_commands ${sample.simInMemoryPersistenceCommands}`);
    expect(exposition).toContain("# TYPE sim_inmemory_persistence_events gauge");
    expect(exposition).toContain(`sim_inmemory_persistence_events ${sample.simInMemoryPersistenceEvents}`);
    expect(exposition).toContain("# TYPE sim_inmemory_persistence_evicted_total counter");
    expect(exposition).toContain(`sim_inmemory_persistence_evicted_total ${sample.simInMemoryPersistenceEvictedTotal}`);
  });

  it("leaves the gauges untouched when the injected persistence keeps no log", () => {
    const noStats: SimulationPersistence = { recordCommand: () => undefined, recordEvent: () => undefined, snapshot: () => ({ commands: [], events: [] }) };
    const runtime = new SimulationRuntime({ now: () => 1_000, persistence: noStats });
    const metrics = createSimulationMetrics();
    expect(runtime.persistenceLogStats()).toBeUndefined();
    samplePersistenceLogMetrics(runtime, metrics);
    expect(metrics.snapshot().simInMemoryPersistenceCommands).toBe(0);
  });
});
