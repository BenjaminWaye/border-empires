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
import type { SimulationSnapshotSections, SimulationSnapshotStore, StoredSimulationSnapshot } from "../snapshot-store/snapshot-store.js";
import type { SqliteSimulationSnapshotStore } from "../sqlite-snapshot-store/sqlite-snapshot-store.js";
import { resolveWorkerEntryUrl } from "../resolve-worker-entry/resolve-worker-entry.js";

type AckMessage =
  | { id: number; ok: true; handlerStartedAtMs?: number; workMs?: number }
  | { id: number; ok: false; error: string; handlerStartedAtMs?: number; workMs?: number };

export type WriterWriteTiming = {
  op: string;
  /** Time between this channel's postMessage and the worker's handler actually starting. Large values mean the
   * worker was still busy with a prior message (or GC/CPU contention), NOT that this op's SQL was slow. */
  queueWaitMs: number;
  /** Time the worker spent inside the handler (the actual synchronous SQL work) once it started. */
  workMs: number;
  /** Full round trip as seen by the sim thread — queueWaitMs + workMs + postMessage/dispatch overhead. */
  totalMs: number;
};

// No hard limit on in-flight messages previously existed here: if the writer
// worker fell behind (e.g. a burst of AI upkeep accrual across many large
// empires), `pending` grew without bound, turning a temporary slowdown into
// unbounded sim-thread heap growth. Confirmed 2026-07-05: a persistence
// backlog cascaded into 47-53s single "event_store" stalls and the sim
// worker OOM'd at the --max-old-space-size cap. DEFAULT_MAX_PENDING makes
// the sim thread self-throttle (await drain) once the queue backs up,
// bounding memory at the cost of slowing writers down further under
// sustained backlog — the correct trade: a backed-up writer should push
// back on its caller, not let the caller pile up unbounded work in memory.
const DEFAULT_MAX_PENDING = 500;

export class SqliteWriterChannel {
  private readonly worker: Worker;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { op: string; sentAtMs: number; resolve: () => void; reject: (e: Error) => void }
  >();
  private readonly onWriteTimed: ((sample: WriterWriteTiming) => void) | undefined;
  // Gate applied BEFORE constructing a WriterWriteTiming sample or reading
  // Date.now() a second time — appendEvent/markAccepted/etc. fire on every
  // command, far more often than other trackSync-style instrumentation in
  // this codebase, so the fast (not-slow) path must stay allocation-free.
  private readonly slowThresholdMs: number;
  private readonly maxPending: number;
  private readonly onQueueDepthChanged: ((depth: number) => void) | undefined;
  private readonly onBackpressureWait: (() => void) | undefined;
  private drainWaiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
  // Set once the worker dies. A caller queued in drainWaiters at that point
  // must be REJECTED, not released to proceed — if we just resolved it, its
  // post() would go on to call postMessage on a dead worker and construct a
  // new pending entry that no "message"/"error"/"exit" handler will ever
  // touch again, hanging the caller's await forever. Also checked at the top
  // of post() so a call made entirely after death fails fast instead of
  // silently hanging the same way.
  private fatalError: Error | undefined;

  constructor(
    dbPath: string,
    options: {
      onWriteTimed?: (sample: WriterWriteTiming) => void;
      slowThresholdMs?: number;
      maxPending?: number;
      onQueueDepthChanged?: (depth: number) => void;
      onBackpressureWait?: () => void;
    } = {}
  ) {
    this.onWriteTimed = options.onWriteTimed;
    this.slowThresholdMs = Math.max(0, options.slowThresholdMs ?? 0);
    this.maxPending = Math.max(1, options.maxPending ?? DEFAULT_MAX_PENDING);
    this.onQueueDepthChanged = options.onQueueDepthChanged;
    this.onBackpressureWait = options.onBackpressureWait;
    const workerUrl = resolveWorkerEntryUrl("../sqlite-writer-worker.js", import.meta.url);
    this.worker = new Worker(workerUrl, { workerData: { dbPath } });
    this.worker.on("message", (msg: AckMessage) => {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      this.onQueueDepthChanged?.(this.pending.size);
      this.releaseDrainWaiterIfRoom();
      if (this.onWriteTimed && typeof msg.handlerStartedAtMs === "number" && typeof msg.workMs === "number") {
        const queueWaitMs = Math.max(0, msg.handlerStartedAtMs - entry.sentAtMs);
        if (queueWaitMs >= this.slowThresholdMs || msg.workMs >= this.slowThresholdMs) {
          this.onWriteTimed({
            op: entry.op,
            queueWaitMs,
            workMs: msg.workMs,
            totalMs: Math.max(0, Date.now() - entry.sentAtMs)
          });
        }
      }
      if (msg.ok) {
        entry.resolve();
      } else {
        entry.reject(new Error(msg.error));
      }
    });
    this.worker.on("error", (err) => {
      this.fatalError = err;
      for (const entry of this.pending.values()) entry.reject(err);
      this.pending.clear();
      this.onQueueDepthChanged?.(0);
      this.rejectAllDrainWaiters(err);
    });
    this.worker.on("exit", (code) => {
      const err = new Error(`sqlite-writer-worker exited unexpectedly (code ${code})`);
      this.fatalError ??= err;
      if (this.pending.size > 0) {
        for (const entry of this.pending.values()) entry.reject(err);
        this.pending.clear();
        this.onQueueDepthChanged?.(0);
      }
      this.rejectAllDrainWaiters(err);
    });
  }

  private releaseDrainWaiterIfRoom(): void {
    if (this.drainWaiters.length === 0) return;
    if (this.pending.size >= this.maxPending) return;
    const waiter = this.drainWaiters.shift();
    waiter?.resolve();
  }

  private rejectAllDrainWaiters(err: Error): void {
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const waiter of waiters) waiter.reject(err);
  }

  private waitForDrain(): Promise<void> {
    this.onBackpressureWait?.();
    return new Promise<void>((resolve, reject) => this.drainWaiters.push({ resolve, reject }));
  }

  async post(msg: { op: string } & Record<string, unknown>): Promise<void> {
    if (this.fatalError) throw this.fatalError;
    if (this.pending.size >= this.maxPending) {
      await this.waitForDrain();
    }
    const id = this.nextId++;
    const result = new Promise<void>((resolve, reject) => {
      this.pending.set(id, { op: msg.op, sentAtMs: Date.now(), resolve, reject });
    });
    this.onQueueDepthChanged?.(this.pending.size);
    this.worker.postMessage({ ...msg, id });
    return result;
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
    private readonly reader: SimulationEventStore,
    private readonly onSyncAppendDuration?: (stringifyMs: number, syncMs: number, eventType: string, commandId: string) => void
  ) {}

  async appendEvent(event: SimulationEvent, createdAt: number): Promise<void> {
    const stringifyStartedAt = Date.now();
    const payloadJson = JSON.stringify(event);
    const stringifyMs = Date.now() - stringifyStartedAt;
    const promise = this.channel.post({
      op: "appendEvent",
      commandId: event.commandId,
      playerId: event.playerId,
      eventType: event.eventType,
      payloadJson,
      createdAt
    });
    // Measured before the await — this is the actual main-thread-blocking
    // cost (JSON.stringify + worker.postMessage structured clone). The await
    // below yields; it must not be included in this measurement.
    this.onSyncAppendDuration?.(stringifyMs, Date.now() - stringifyStartedAt, event.eventType, event.commandId);
    await promise;
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

// SimulationSnapshotStore whose writes go through the writer worker.
// The snapshot INSERT and retention DELETE are committed atomically in the worker.
// Prune + WAL checkpoint follow as a best-effort second message so a prune
// failure can never roll back the snapshot that was already committed.
// Reads delegate to the underlying SQLite store on the sim thread (WAL allows it).
export class WriterBackedSnapshotStore implements SimulationSnapshotStore {
  constructor(
    private readonly channel: SqliteWriterChannel,
    private readonly reader: SqliteSimulationSnapshotStore,
    private readonly onPruneFailure?: (error: unknown) => void
  ) {}

  async saveSnapshot(snapshot: {
    lastAppliedEventId: number;
    snapshotSections: SimulationSnapshotSections;
    createdAt: number;
  }): Promise<void> {
    const json = await this.reader.preparePayload(snapshot.snapshotSections);
    await this.channel.post({ op: "saveSnapshot", lastAppliedEventId: snapshot.lastAppliedEventId, json, createdAt: snapshot.createdAt });
    try {
      await this.channel.post({ op: "pruneAndCheckpoint" });
    } catch (err) {
      this.onPruneFailure?.(err);
    }
  }

  loadLatestSnapshot(): Promise<StoredSimulationSnapshot | undefined> {
    return this.reader.loadLatestSnapshot();
  }

  getLastLoadedFormatVersion(): number | undefined {
    return this.reader.getLastLoadedFormatVersion();
  }
}
