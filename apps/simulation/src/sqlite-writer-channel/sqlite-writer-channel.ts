// Channel to the dedicated SQLite writer worker. Exposes writer-backed
// implementations of SimulationEventStore and SimulationCommandStore whose
// write methods post to the worker and await an ack — so the sim thread's
// event loop is free during the actual I/O. Read methods delegate to the
// caller-supplied SQLite read instances (WAL mode allows concurrent readers).

import { Worker } from "node:worker_threads";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import type { SimulationEventStore, StoredSimulationEvent } from "../event-store/event-store.js";
import type { SimulationCommandStore, StoredSimulationCommand } from "../command-store/command-store.js";
import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";

type AckMessage = { id: number; ok: true } | { id: number; ok: false; error: string };

export class SqliteWriterChannel {
  private readonly worker: Worker;
  private nextId = 0;
  private readonly pending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();

  constructor(dbPath: string) {
    const workerUrl = resolveWorkerEntryUrl("../sqlite-writer-worker.js", import.meta.url);
    this.worker = new Worker(workerUrl, { workerData: { dbPath } });
    this.worker.on("message", (msg: AckMessage) => {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve();
      } else {
        entry.reject(new Error(msg.error));
      }
    });
    this.worker.on("error", (err) => {
      for (const entry of this.pending.values()) entry.reject(err);
      this.pending.clear();
    });
    this.worker.on("exit", (code) => {
      if (this.pending.size === 0) return;
      const err = new Error(`sqlite-writer-worker exited unexpectedly (code ${code})`);
      for (const entry of this.pending.values()) entry.reject(err);
      this.pending.clear();
    });
  }

  post(msg: object): Promise<void> {
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id });
    });
  }

  async terminate(): Promise<void> {
    await this.worker.terminate();
  }
}

// SimulationEventStore whose writes go through the writer worker.
// Reads delegate to the underlying SQLite store on the sim thread.
export class WriterBackedEventStore implements SimulationEventStore {
  constructor(
    private readonly channel: SqliteWriterChannel,
    private readonly reader: SimulationEventStore
  ) {}

  async appendEvent(event: SimulationEvent, createdAt: number): Promise<void> {
    await this.channel.post({
      op: "appendEvent",
      commandId: event.commandId,
      playerId: event.playerId,
      eventType: event.eventType,
      payloadJson: JSON.stringify(event),
      createdAt
    });
  }

  loadAllEvents(): Promise<StoredSimulationEvent[]> { return this.reader.loadAllEvents(); }
  loadEventsAfter(eventId: number, limit?: number): Promise<StoredSimulationEvent[]> { return this.reader.loadEventsAfter(eventId, limit); }
  loadEventsForCommand(commandId: string): Promise<StoredSimulationEvent[]> { return this.reader.loadEventsForCommand(commandId); }
  loadLatestEventId(): Promise<number> { return this.reader.loadLatestEventId(); }
}

// SimulationCommandStore whose writes go through the writer worker.
// Reads delegate to the underlying SQLite store on the sim thread.
export class WriterBackedCommandStore implements SimulationCommandStore {
  constructor(
    private readonly channel: SqliteWriterChannel,
    private readonly reader: SimulationCommandStore
  ) {}

  async persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<void> {
    await this.channel.post({
      op: "persistQueuedCommand",
      commandId: command.commandId,
      sessionId: command.sessionId,
      playerId: command.playerId,
      clientSeq: command.clientSeq,
      commandType: command.type,
      payloadJson: command.payloadJson,
      queuedAt
    });
  }

  async markAccepted(commandId: string, createdAt: number): Promise<void> {
    await this.channel.post({ op: "markAccepted", commandId, createdAt });
  }

  async markRejected(commandId: string, createdAt: number, code: string, message: string): Promise<void> {
    await this.channel.post({ op: "markRejected", commandId, createdAt, code, message });
  }

  async markResolved(commandId: string, createdAt: number): Promise<void> {
    await this.channel.post({ op: "markResolved", commandId, createdAt });
  }

  get(commandId: string): Promise<StoredSimulationCommand | undefined> { return this.reader.get(commandId); }
  findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredSimulationCommand | undefined> { return this.reader.findByPlayerSeq(playerId, clientSeq); }
  loadRecoverableCommands(): Promise<StoredSimulationCommand[]> { return this.reader.loadRecoverableCommands(); }
  loadAllCommands(): Promise<StoredSimulationCommand[]> { return this.reader.loadAllCommands(); }
}
