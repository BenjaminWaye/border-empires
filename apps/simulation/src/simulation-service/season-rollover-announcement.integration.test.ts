import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { credentials, loadPackageDefinition } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

import { createSimulationService } from "./simulation-service.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { InMemorySimulationSnapshotStore } from "../snapshot-store/snapshot-store.js";
import { InMemorySeasonSummaryStore } from "../season-summary-store.js";
import { InMemorySimulationCommandStore } from "../command-store/command-store.js";

const silentLog = { info: () => undefined, error: () => undefined, warn: () => undefined };

type ProtoEvent = { event_type?: string; player_id?: string; payload_json?: string };
type RawClient = {
  StartNextSeason: (request: { force: boolean; imperial_ward_json: string }, callback: (error: Error | null) => void) => void;
  StreamEvents: (request: { at: number }) => { on: (name: string, listener: (value: never) => void) => void; cancel: () => void };
};

const packageDefinition = loadSync(
  fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)),
  { keepCase: true, longs: Number, defaults: true, enums: String, oneofs: false }
);
const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: { simulation: { SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawClient } };
};

// Contract with the gateway: the gateway only recognises a rollover that reaches
// it as a PLAYER_MESSAGE addressed to nobody ("") or to everyone ("__broadcast__")
// carrying payload.type SEASON_ROLLOVER (apps/realtime-gateway/src/season-rollover-resync).
// If this announcement changes shape, connected clients silently stop being
// reconnected into the new season and keep showing the old one.
describe("season rollover announcement", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  it("is streamed to the gateway as a SEASON_ROLLOVER player message with the new season id", async () => {
    const service = await createSimulationService({
      commandStore: new InMemorySimulationCommandStore(),
      eventStore: new InMemorySimulationEventStore(),
      snapshotStore: new InMemorySimulationSnapshotStore(),
      seasonSummaryStore: new InMemorySeasonSummaryStore(),
      rulesetId: "seasonal-default",
      host: "127.0.0.1",
      port: 0,
      log: silentLog
    });
    cleanup.push(() => service.close());
    const started = await service.start();
    const client = new proto.border_empires.simulation.SimulationService(started.address, credentials.createInsecure());

    const stream = client.StreamEvents({ at: Date.now() });
    const announcement = new Promise<ProtoEvent>((resolve, reject) => {
      stream.on("data", ((event: ProtoEvent) => {
        if (event.event_type === "PLAYER_MESSAGE" && event.payload_json?.includes("SEASON_ROLLOVER")) resolve(event);
      }) as (value: never) => void);
      stream.on("error", reject as (value: never) => void);
    });
    await new Promise<void>((resolve, reject) => client.StartNextSeason({ force: true, imperial_ward_json: "" }, (error) => (error ? reject(error) : resolve())));

    const event = await announcement;
    stream.cancel();
    expect(["", "__broadcast__"]).toContain(event.player_id);
    const payload = JSON.parse(event.payload_json ?? "{}") as { type?: string; seasonId?: string };
    expect(payload.type).toBe("SEASON_ROLLOVER");
    expect(payload.seasonId).toEqual(expect.any(String));
  }, 120_000);
});
