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

type RawClient = {
  StartNextSeason?: (request: { force: boolean; imperial_ward_json: string }, callback: (error: Error | null, response: { ok: boolean }) => void) => void;
  GetSeasonParticipationForPlayer?: (request: { player_id: string }, callback: (error: Error | null, response: { ok: boolean; participation_json?: string }) => void) => void;
};

const packageDefinition = loadSync(
  fileURLToPath(new URL("../../../../packages/sim-protocol/src/simulation.proto", import.meta.url)),
  { keepCase: true, longs: Number, defaults: true, enums: String, oneofs: false }
);
const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: { simulation: { SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => RawClient } };
};
const createClient = (address: string): RawClient => new proto.border_empires.simulation.SimulationService(address, credentials.createInsecure());

const startNextSeason = (client: RawClient): Promise<{ ok: boolean }> =>
  new Promise((resolve, reject) => {
    if (!client.StartNextSeason) return reject(new Error("StartNextSeason unavailable"));
    client.StartNextSeason({ force: true, imperial_ward_json: "" }, (error, response) => (error ? reject(error) : resolve({ ok: response.ok })));
  });

const getSeasonParticipation = (client: RawClient, playerId: string): Promise<{ ok: boolean; participation_json?: string }> =>
  new Promise((resolve, reject) => {
    if (!client.GetSeasonParticipationForPlayer) return reject(new Error("GetSeasonParticipationForPlayer unavailable"));
    client.GetSeasonParticipationForPlayer({ player_id: playerId }, (error, response) => (error ? reject(error) : resolve(response)));
  });

describe("season participation is recorded from the full leaderboard at rollover", () => {
  const cleanup: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanup.length > 0) await cleanup.pop()?.();
  });

  it("makes a player's rank/score queryable via GetSeasonParticipationForPlayer after a season rollover", async () => {
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
    const client = createClient(started.address);

    await expect(startNextSeason(client)).resolves.toEqual({ ok: true });

    const response = await getSeasonParticipation(client, "player-1");
    expect(response.ok).toBe(true);
    const rows = JSON.parse(response.participation_json ?? "[]") as Array<{ seasonId: string; playerId: string; rank: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.playerId).toBe("player-1");
    expect(rows[0]?.rank).toBeGreaterThan(0);
  }, 60_000);

  it("returns ok:false for a playerId with no season history", async () => {
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
    const client = createClient(started.address);

    const response = await getSeasonParticipation(client, "");
    expect(response.ok).toBe(false);
  });
});
