import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { DIPLOMACY_SETTLEMENT_COMMAND_PREFIX } from "@border-empires/sim-protocol";

import { createSimulationService } from "./simulation-service.js";

// Regression: the gateway files a deal/gift payment under the empire being
// paid and waits on its verdict. The simulation dropped events for players
// with no subscriber, so a payment to an offline empire (every AI) never
// answered and the gateway timed out after 30s.

type StreamedEvent = { event_type?: string; command_id?: string; player_id?: string };
type CommandRequest = { command_id: string; session_id: string; player_id: string; client_seq: number; issued_at: number; type: string; payload_json: string };
type RawSimulationClient = {
  SubmitCommand: (request: CommandRequest, callback: (error: Error | null) => void) => void;
  StreamEvents: (request: { at: number }) => { on: (event: "data" | "error", handler: (value: StreamedEvent) => void) => void; cancel: () => void };
};

const packageDefinition = loadSync(fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)), {
  keepCase: true, longs: Number, defaults: true, enums: String, oneofs: false
});
const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: { simulation: { SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawSimulationClient } };
};

const waitForVerdict = (client: RawSimulationClient, commandId: string, timeoutMs = 4_000): Promise<StreamedEvent> => {
  const stream = client.StreamEvents.call(client, { at: Date.now() });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { stream.cancel(); reject(new Error(`no verdict streamed for ${commandId}`)); }, timeoutMs);
    stream.on("data", (event) => {
      if (event.command_id !== commandId || (event.event_type !== "COMMAND_RESOLVED" && event.event_type !== "COMMAND_REJECTED")) return;
      clearTimeout(timeout);
      stream.cancel();
      resolve(event);
    });
    stream.on("error", (error) => { clearTimeout(timeout); reject(error); });
  });
};

describe("simulation streams diplomacy settlement verdicts without a subscriber", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => { while (cleanup.length > 0) await cleanup.pop()?.(); });

  it("streams COMMAND_RESOLVED for a payment to a player nobody is subscribed to", async () => {
    const service = await createSimulationService({ host: "127.0.0.1", port: 0, enableAiAutopilot: false, enableSystemAutopilot: false, log: { info: () => undefined, error: () => undefined } });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = new proto.border_empires.simulation.SimulationService(started.address, credentials.createInsecure());

    const ownerIds = [...new Set(service.runtime.exportState().tiles.flatMap((tile) => (tile.ownerId ? [tile.ownerId] : [])))];
    const [payerId, payeeId] = ownerIds;
    expect(payeeId, "expected two seeded players").toBeDefined();
    if (!payerId || !payeeId) return;

    // Neither player is subscribed: the production shape for a gift to an AI.
    const commandId = `${DIPLOMACY_SETTLEMENT_COMMAND_PREFIX}regression-gift`;
    const verdict = waitForVerdict(client, commandId);
    await new Promise<void>((resolve, reject) => {
      client.SubmitCommand.call(client, {
        command_id: commandId, session_id: "system-runtime:social", player_id: payeeId, client_seq: 0, issued_at: Date.now(),
        type: "SETTLE_DIPLOMACY_TERMS",
        payload_json: JSON.stringify({ proposerId: payerId, targetId: payeeId, proposerPays: { gold: 0 }, targetPays: { gold: 0 } })
      }, (error) => (error ? reject(error) : resolve()));
    });

    await expect(verdict).resolves.toEqual(expect.objectContaining({ event_type: "COMMAND_RESOLVED", command_id: commandId, player_id: payeeId }));
  });
});
