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
//   { id, op: "flush" }                (no-op write, used for whenIdle() sync)
//
// Message protocol (this worker → sim thread):
//   { id, ok: true }
//   { id, ok: false, error: string }

import { DatabaseSync } from "node:sqlite";
import { workerData, parentPort } from "node:worker_threads";

type WriteMessage =
  | { id: number; op: "appendEvent"; commandId: string; playerId: string; eventType: string; payloadJson: string; createdAt: number }
  | { id: number; op: "persistQueuedCommand"; commandId: string; sessionId: string; playerId: string; clientSeq: number; commandType: string; payloadJson: string; queuedAt: number }
  | { id: number; op: "markAccepted"; commandId: string; createdAt: number }
  | { id: number; op: "markRejected"; commandId: string; createdAt: number; code: string; message: string }
  | { id: number; op: "markResolved"; commandId: string; createdAt: number }
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
const stmtMarkAccepted = db.prepare(
  `UPDATE command_results SET status = 'ACCEPTED', accepted_at = ? WHERE command_id = ?`
);
const stmtMarkRejected = db.prepare(
  `UPDATE command_results SET status = 'REJECTED', rejected_at = ?, rejected_code = ?, rejected_message = ? WHERE command_id = ?`
);
const stmtMarkResolved = db.prepare(
  `UPDATE command_results SET status = 'RESOLVED', resolved_at = ? WHERE command_id = ?`
);

parentPort.on("message", (msg: WriteMessage) => {
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
      case "flush":
        break;
    }
    parentPort!.postMessage({ id: msg.id, ok: true });
  } catch (error) {
    parentPort!.postMessage({ id: msg.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
