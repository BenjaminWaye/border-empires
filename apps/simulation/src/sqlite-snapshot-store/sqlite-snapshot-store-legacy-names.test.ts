import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { SqliteSimulationCommandStore } from "../sqlite-command-store.js";
import { SqliteSimulationEventStore } from "../sqlite-event-store.js";
import { SqliteSimulationSnapshotStore } from "./sqlite-snapshot-store.js";

// vitest cannot resolve the bare "node:sqlite" builtin, so load it via require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => DatabaseSyncType };

// A world saved before the structure id rename must recover with current ids:
// the snapshot, the event log after it and still-queued commands all carry
// the old spellings on disk.
describe("startup recovery reads pre-rename structure ids", () => {
  const openDb = async () => {
    const db = new DatabaseSync(":memory:");
    const events = new SqliteSimulationEventStore(db);
    const snapshots = new SqliteSimulationSnapshotStore(db);
    const commands = new SqliteSimulationCommandStore(db);
    await events.applySchema();
    await snapshots.applySchema();
    await commands.applySchema();
    return { db, events, snapshots, commands };
  };

  it("upgrades tiles in the latest snapshot", async () => {
    const { db, snapshots } = await openDb();
    const legacyPayload = {
      initialState: {
        tiles: [
          { x: 1, y: 1, economicStructure: { type: "TRADE_NEXUS", status: "active" } },
          { x: 2, y: 1, siegeBattery: { variant: "SIEGE_BATTERY", status: "active" }, fort: { variant: "PALISADE", status: "active" } },
          { x: 3, y: 1, economicStructure: { type: "AMBARIC_TRANSFORMER", status: "active" }, observatory: { status: "active" } }
        ],
        players: [{ id: "p1", name: "SKY_DOCK", techIds: ["world-engine"] }]
      },
      commandEvents: []
    };
    db.prepare("INSERT INTO world_snapshots (last_applied_event_id, snapshot_payload, created_at) VALUES (?, ?, ?)").run(
      0,
      JSON.stringify(legacyPayload),
      1
    );

    const loaded = await snapshots.loadLatestSnapshot();
    const tiles = loaded?.snapshotPayload.initialState.tiles as unknown as Array<Record<string, unknown>>;

    expect(tiles[0]).toMatchObject({ economicStructure: { type: "TRADE_NEXUS" } });
    expect(tiles[1]).toMatchObject({ siegeBattery: { variant: "SIEGE_BATTERY" }, fort: { variant: "PALISADE" } });
    expect(tiles[1]).not.toHaveProperty("siegeBattery");
    // The Ambaric Transformer's old id; OBSERVATORY keeps its id this release.
    expect(tiles[2]).toMatchObject({ economicStructure: { type: "AMBARIC_TRANSFORMER" }, observatory: { status: "active" } });
    // Player names and tech ids are not structure ids.
    expect(loaded?.snapshotPayload.initialState.players[0]).toMatchObject({ name: "SKY_DOCK", techIds: ["world-engine"] });
  });

  it("upgrades event types and payloads replayed from the event log", async () => {
    const { db, events } = await openDb();
    db.prepare(
      "INSERT INTO world_events (command_id, player_id, event_type, event_payload, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("c1", "p1", "TILE_DELTA", JSON.stringify({ eventType: "TILE_DELTA", tileDeltas: [{ x: 1, y: 1, economicStructureJson: '{"type":"INCUBATION_ENGINE"}' }] }), 1);

    const [event] = await events.loadEventsAfter(0, 10);

    expect(event?.eventPayload).toMatchObject({ tileDeltas: [{ economicStructureJson: '{"type":"INCUBATION_ENGINE"}' }] });
  });

  it("upgrades queued commands so they replay against current ids", async () => {
    const { db, commands } = await openDb();
    db.prepare(
      "INSERT INTO commands (command_id, session_id, player_id, client_seq, command_type, payload_json, queued_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("c1", "s1", "p1", 1, "BUILD_SIEGE_BATTERY", JSON.stringify({ x: 4, y: 5 }), 1);
    db.prepare("INSERT INTO command_results (command_id, status) VALUES (?, ?)").run("c1", "QUEUED");
    db.prepare(
      "INSERT INTO commands (command_id, session_id, player_id, client_seq, command_type, payload_json, queued_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("c2", "s1", "p1", 2, "BUILD_ECONOMIC_STRUCTURE", JSON.stringify({ x: 4, y: 6, structureType: "ORE_REFINERY" }), 2);
    db.prepare("INSERT INTO command_results (command_id, status) VALUES (?, ?)").run("c2", "QUEUED");

    const [siege, economic] = await commands.loadRecoverableCommands();

    expect(siege?.type).toBe("BUILD_SIEGE_BATTERY");
    expect(JSON.parse(economic?.payloadJson ?? "{}")).toEqual({ x: 4, y: 6, structureType: "ORE_REFINERY" });
  });
});
