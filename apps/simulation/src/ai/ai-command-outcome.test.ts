import { expect, it } from "vitest";
import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";
import { createAiCommandProducer } from "./ai-command-producer.js";

it("releases an instant ability pending gate on COMMAND_RESOLVED without a tile delta", async () => {
  let listener: (event: SimulationEvent) => void = () => {};
  const submitted: CommandEnvelope[] = [];
  const producer = createAiCommandProducer({
    aiPlayerIds: ["ai-1"], now: () => 1000, tickIntervalMs: 100000,
    runtime: {
      onEvent: callback => { listener = callback; return () => {}; },
      queueDepths: () => ({ ai: 0, system: 0, human_interactive: 0, human_noninteractive: 0 }),
      chooseNextAutomationCommand: (playerId, clientSeq, issuedAt) => ({ playerId, clientSeq, issuedAt,
        sessionId: `ai-runtime:${playerId}`, commandId: `cast-${clientSeq}`, type: "SURVEY_SWEEP", payloadJson: '{"x":1,"y":2}' })
    },
    submitCommand: async command => { submitted.push(command); }
  });
  try {
    await producer.tick();
    const first = submitted[0]!;
    expect(first.type).toBe("SURVEY_SWEEP");
    listener({ eventType: "COMMAND_RESOLVED", playerId: first.playerId, commandId: first.commandId });
    await producer.tick();
    expect(submitted).toHaveLength(2);
    expect(submitted[1]!.clientSeq).toBeGreaterThan(first.clientSeq);
  } finally { producer.close(); }
});
