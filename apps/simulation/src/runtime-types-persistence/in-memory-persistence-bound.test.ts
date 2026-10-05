import { describe, expect, it } from "vitest";

import type { CommandEnvelope, SimulationEvent } from "../runtime-types.js";
import { InMemorySimulationPersistence } from "../runtime-types.js";

const event = (n: number) => ({ eventType: "PLAYER_UPDATE", commandId: `c${n}`, payloadJson: "x".repeat(100) }) as unknown as SimulationEvent;
const command = (n: number) => ({ commandId: `c${n}` }) as unknown as CommandEnvelope;

// Regression (2026-10-04): the runtime's default persistence kept every event and
// command forever; ~166 MB of PLAYER_UPDATE payloadJson strings were retained on
// staging/prod and the sim worker hit its heap cap about every 18h.
describe("InMemorySimulationPersistence", () => {
  it("stays bounded and keeps the most recent events and commands", () => {
    const persistence = new InMemorySimulationPersistence(100);
    for (let n = 0; n < 10_000; n += 1) {
      persistence.recordEvent(event(n));
      persistence.recordCommand(command(n));
    }
    const { events, commands } = persistence.snapshot();
    expect(events.length).toBeLessThanOrEqual(125);
    expect(commands.length).toBeLessThanOrEqual(125);
    expect(events.length).toBeGreaterThanOrEqual(100);
    expect((events.at(-1) as unknown as { commandId: string }).commandId).toBe("c9999");
    expect(commands.at(-1)?.commandId).toBe("c9999");
  });

  it("keeps everything below the cap", () => {
    const persistence = new InMemorySimulationPersistence(100);
    for (let n = 0; n < 50; n += 1) persistence.recordEvent(event(n));
    expect(persistence.snapshot().events).toHaveLength(50);
  });
});
