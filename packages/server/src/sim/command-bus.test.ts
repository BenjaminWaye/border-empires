import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerMessageHandler = (value: any) => void;

class FakeWorker {
  private handlers = new Map<string, WorkerMessageHandler[]>();
  private humanQueue: Array<{ jobId: number; priority: "human" | "system" | "ai" }> = [];
  private systemQueue: Array<{ jobId: number; priority: "human" | "system" | "ai" }> = [];
  private aiQueue: Array<{ jobId: number; priority: "human" | "system" | "ai" }> = [];
  private configured = false;
  private batchInFlight = false;
  private dispatchScheduled = false;
  private quotas = { human: 1, system: 1, ai: 1, max: 8 };

  constructor() {
    queueMicrotask(() => this.emit("message", { type: "ready" }));
  }

  on(event: string, handler: WorkerMessageHandler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  postMessage(message: any): void {
    if (message.type === "configure") {
      this.configured = true;
      this.quotas = {
        human: message.drainHumanQuota,
        system: message.drainSystemQuota,
        ai: message.drainAiQuota,
        max: message.drainMaxCommands
      };
      this.dispatchNext();
      return;
    }
    if (message.type === "enqueue") {
      const queue =
        message.job.priority === "human"
          ? this.humanQueue
          : message.job.priority === "system"
            ? this.systemQueue
            : this.aiQueue;
      queue.push(message.job);
      this.dispatchNext();
      return;
    }
    this.batchInFlight = false;
    this.dispatchNext();
  }

  terminate(): Promise<number> {
    return Promise.resolve(0);
  }

  private dispatchNext(): void {
    if (!this.configured || this.batchInFlight || this.dispatchScheduled) return;
    this.dispatchScheduled = true;
    setTimeout(() => {
      this.dispatchScheduled = false;
      this.flushDispatch();
    }, 0);
  }

  private flushDispatch(): void {
    if (!this.configured || this.batchInFlight) return;
    const jobs: Array<{ jobId: number; priority: "human" | "system" | "ai" }> = [];
    let human = 0;
    let system = 0;
    let ai = 0;
    while (jobs.length < this.quotas.max) {
      const next =
        this.humanQueue.length > 0 && (human < this.quotas.human || (this.systemQueue.length === 0 && this.aiQueue.length === 0))
          ? this.humanQueue.shift()
          : this.systemQueue.length > 0 && (system < this.quotas.system || (this.humanQueue.length === 0 && this.aiQueue.length === 0))
            ? this.systemQueue.shift()
            : this.aiQueue.length > 0 && (ai < this.quotas.ai || this.humanQueue.length === 0)
              ? this.aiQueue.shift()
              : this.humanQueue.shift() ?? this.systemQueue.shift() ?? this.aiQueue.shift();
      if (!next) break;
      jobs.push(next);
      if (next.priority === "human") human += 1;
      else if (next.priority === "system") system += 1;
      else ai += 1;
    }
    if (jobs.length <= 0) return;
    this.batchInFlight = true;
    queueMicrotask(() =>
      this.emit("message", {
        type: "dispatch_batch",
        jobs,
        queueDepths: {
          human: this.humanQueue.length,
          system: this.systemQueue.length,
          ai: this.aiQueue.length
        }
      })
    );
  }

  private emit(event: string, value: any): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(value);
    }
  }
}

vi.mock("node:worker_threads", () => ({
  Worker: FakeWorker
}));

afterEach(() => {
  vi.resetModules();
});

describe("createSimulationCommandBus", () => {
  it("dispatches queued commands through the worker while preserving priority quotas", async () => {
    const { createSimulationCommandBus } = await import("./command-bus.js");
    const executed: string[] = [];
    const queueTask = (fn: () => void): void => {
      queueMicrotask(fn);
    };
    const bus = createSimulationCommandBus<
      { id: string; priority: "human" | "system" | "ai"; kind: "human" | "system" },
      never,
      { id: string; priority: "human" | "system" | "ai"; kind: "human" | "system" }
    >({
      now: (() => {
        let t = 0;
        return () => ++t;
      })(),
      drainBudgetMs: 12,
      drainMaxCommands: 4,
      drainHumanQuota: 1,
      drainSystemQuota: 1,
      drainAiQuota: 1,
      queueTask,
      executeHumanOrAiJob: async (job) => {
        executed.push(job.id);
      },
      executeSystemCommand: async (command) => {
        executed.push(command.id);
      },
      getJobPriority: (job) => job.priority,
      getSystemCommand: (job) => job,
      onError: vi.fn()
    });

    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));

    bus.enqueueJob({ id: "h1", priority: "human", kind: "human" });
    bus.enqueueJob({ id: "a1", priority: "ai", kind: "human" });
    bus.enqueueJob({ id: "s1", priority: "system", kind: "system" });
    bus.enqueueJob({ id: "h2", priority: "human", kind: "human" });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    expect(executed).toEqual(["h1", "s1", "a1", "h2"]);
    expect(bus.queueDepth()).toBe(0);
    expect(bus.state.lastDrainCommands).toBeGreaterThan(0);
  });
});
