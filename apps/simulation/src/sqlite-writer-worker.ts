// Dedicated SQLite writer worker — owns the single write connection to the
// simulation database. All INSERT/UPDATE operations are routed here from the
// sim thread via postMessage so the sim's event loop is never blocked by I/O.
//
// Message protocol (sim thread → this worker):
//   { id, op: "appendEvent",          commandId, playerId, eventType, payloadJson, createdAt }
//   { id, op: "persistQueuedCommand", commandId, sessionId, playerId, clientSeq, commandType, payloadJson, queuedAt }
//   { id, op: "markAccepted",         commandId, createdAt }
//   { id, op: "markRejected",         commandId, createdAt, code, message }
//   { id, op: "markResolved",         commandId, createdAt }
//   { id, op: "saveSnapshot",         lastAppliedEventId, json, createdAt }
//   { id, op: "pruneAndCheckpoint" }  (prune world_events below oldest retained snapshot,
//                                      prune RESOLVED/REJECTED commands older than
//                                      SIMULATION_COMMAND_RETENTION_MS, + WAL checkpoint)
//   { id, op: "flush" }                (no-op write, used for whenIdle() sync)
//
// Message protocol (this worker → sim thread):
//   { id, ok: true, handlerStartedAtMs, workMs }
//   { id, ok: false, error: string, handlerStartedAtMs, workMs }
//
// handlerStartedAtMs/workMs let the sim thread discriminate "the SQL
// statement itself was slow" (workMs is large) from "this worker was still
// busy running a PREVIOUS message's handler when this one was queued" (the
// gap between the sim thread's postMessage and handlerStartedAtMs is large —
// see SqliteWriterChannel's queueWaitMs). A single round-trip duration on the
// sim thread can't tell these apart; they call for very different fixes.

import { DatabaseSync } from "node:sqlite";
import { workerData, parentPort } from "node:worker_threads";

type WriteMessage =
  | { id: number; op: "appendEvent"; commandId: string; playerId: string; eventType: string; payloadJson: string; createdAt: number }
  | { id: number; op: "persistQueuedCommand"; commandId: string; sessionId: string; playerId: string; clientSeq: number; commandType: string; payloadJson: string; queuedAt: number }
  | { id: number; op: "markAccepted"; commandId: string; createdAt: number }
  | { id: number; op: "markRejected"; commandId: string; createdAt: number; code: string; message: string }
  | { id: number; op: "markResolved"; commandId: string; createdAt: number }
  | { id: number; op: "saveSnapshot"; lastAppliedEventId: number; json: string; createdAt: number }
  | { id: number; op: "pruneAndCheckpoint" }
  | { id: number; op: "flush" };

if (!parentPort) throw new Error("sqlite-writer-worker must run inside worker_threads");

const { dbPath } = workerData as { dbPath: string };

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

const stmtInsertEvent = db.prepare(
  `INSERT INTO world_events (command_id, player_id, event_type, event_payload, created_at)
   VALUES (?, ?, ?, ?, ?)`
);
const stmtInsertCommand = db.prepare(
  `INSERT INTO commands (command_id, session_id, player_id, client_seq, command_type, payload_json, queued_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(command_id) DO NOTHING`
);
const stmtInsertCommandResult = db.prepare(
  `INSERT INTO command_results (command_id, status) VALUES (?, 'QUEUED')
   ON CONFLICT(command_id) DO NOTHING`
);
// Keeps client_seq_watermarks correct independent of the commands/command_results
// retention pruning below — see that table's schema comment in
// sqlite-command-store.ts for the full rationale.
const stmtUpsertClientSeqWatermark = db.prepare(
  `INSERT INTO client_seq_watermarks (player_id, max_client_seq) VALUES (?, ?)
   ON CONFLICT(player_id) DO UPDATE SET max_client_seq = MAX(max_client_seq, excluded.max_client_seq)`
);
const stmtMarkAccepted = db.prepare(
  `UPDATE command_results SET status = 'ACCEPTED', accepted_at = ? WHERE command_id = ?`
);
const stmtMarkRejected = db.prepare(
  `UPDATE command_results SET status = 'REJECTED', rejected_at = ?, rejected_code = ?, rejected_message = ? WHERE command_id = ?`
);
const stmtMarkResolved = db.prepare(
  `UPDATE command_results SET status = 'RESOLVED', resolved_at = ? WHERE command_id = ?`
);
// Snapshot statements are prepared lazily on first use. The worker starts
// synchronously when SqliteWriterChannel is constructed, but applySchema()
// (which runs CREATE TABLE IF NOT EXISTS world_snapshots) executes on the
// reader connection afterwards inside createSimulationSnapshotStore. Preparing
// these at module load on a fresh DB would throw "no such table: world_snapshots".
const PRUNE_CHUNK = 5000;
// RESOLVED/REJECTED commands (and their command_results row, cascaded via the
// FK) older than this are pruned during pruneAndCheckpoint. QUEUED/ACCEPTED
// rows are never touched here regardless of age — they're still needed for
// boot recovery. client_seq_watermarks (updated on every insert, see above)
// keeps next-seq reseeding correct after these rows are gone.
const COMMAND_RETENTION_MS = Math.max(0, Number(process.env.SIMULATION_COMMAND_RETENTION_MS ?? 3 * 24 * 60 * 60 * 1000));
let stmtInsertSnapshot: ReturnType<typeof db.prepare> | undefined;
let stmtDeleteOldSnapshots: ReturnType<typeof db.prepare> | undefined;
let stmtPruneEvents: ReturnType<typeof db.prepare> | undefined;
let stmtPruneResolvedCommands: ReturnType<typeof db.prepare> | undefined;

parentPort.on("message", (msg: WriteMessage) => {
  const handlerStartedAtMs = Date.now();
  try {
    switch (msg.op) {
      case "appendEvent":
        stmtInsertEvent.run(msg.commandId, msg.playerId, msg.eventType, msg.payloadJson, msg.createdAt);
        break;
      case "persistQueuedCommand":
        db.exec("BEGIN");
        try {
          stmtInsertCommand.run(msg.commandId, msg.sessionId, msg.playerId, msg.clientSeq, msg.commandType, msg.payloadJson, msg.queuedAt);
          stmtInsertCommandResult.run(msg.commandId);
          stmtUpsertClientSeqWatermark.run(msg.playerId, msg.clientSeq);
          db.exec("COMMIT");
        } catch (txError) {
          db.exec("ROLLBACK");
          throw txError;
        }
        break;
      case "markAccepted":
        stmtMarkAccepted.run(msg.createdAt, msg.commandId);
        break;
      case "markRejected":
        stmtMarkRejected.run(msg.createdAt, msg.code, msg.message, msg.commandId);
        break;
      case "markResolved":
        stmtMarkResolved.run(msg.createdAt, msg.commandId);
        break;
      case "saveSnapshot":
        stmtInsertSnapshot ??= db.prepare(
          `INSERT INTO world_snapshots (last_applied_event_id, snapshot_payload, created_at) VALUES (?, ?, ?)`
        );
        stmtDeleteOldSnapshots ??= db.prepare(
          `DELETE FROM world_snapshots WHERE snapshot_id NOT IN (
            SELECT snapshot_id FROM world_snapshots ORDER BY snapshot_id DESC LIMIT 3
          )`
        );
        db.exec("BEGIN");
        try {
          stmtInsertSnapshot.run(msg.lastAppliedEventId, msg.json, msg.createdAt);
          stmtDeleteOldSnapshots.run();
          db.exec("COMMIT");
        } catch (txError) {
          db.exec("ROLLBACK");
          throw txError;
        }
        break;
      case "pruneAndCheckpoint":
        stmtPruneEvents ??= db.prepare(
          `DELETE FROM world_events WHERE event_id IN (
            SELECT event_id FROM world_events
            WHERE event_id <= (SELECT MIN(last_applied_event_id) FROM world_snapshots)
            LIMIT ?
          )`
        );
        while (true) {
          const result = stmtPruneEvents.run(PRUNE_CHUNK);
          if (!result.changes) break;
        }
        if (COMMAND_RETENTION_MS > 0) {
          stmtPruneResolvedCommands ??= db.prepare(
            `DELETE FROM commands WHERE command_id IN (
              SELECT c.command_id FROM commands c
              JOIN command_results r ON r.command_id = c.command_id
              WHERE r.status IN ('RESOLVED', 'REJECTED') AND c.queued_at < ?
              LIMIT ?
            )`
          );
          const cutoff = Date.now() - COMMAND_RETENTION_MS;
          while (true) {
            const result = stmtPruneResolvedCommands.run(cutoff, PRUNE_CHUNK);
            if (!result.changes) break;
          }
        }
        db.exec("PRAGMA wal_checkpoint(PASSIVE)");
        break;
      case "flush":
        break;
    }
    const workMs = Date.now() - handlerStartedAtMs;
    parentPort!.postMessage({ id: msg.id, ok: true, handlerStartedAtMs, workMs });
  } catch (error) {
    const workMs = Date.now() - handlerStartedAtMs;
    parentPort!.postMessage({
      id: msg.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      handlerStartedAtMs,
      workMs
    });
  }
});
