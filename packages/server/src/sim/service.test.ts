import { afterEach, describe, expect, it, vi } from "vitest";

class FakeWorker {
  private handlers = new Map<string, Array<(value: any) => void>>();
  private queue: Array<{ jobId: number; priority: "human" | "system" | "ai" }> = [];
  private configured = false;
  private batchInFlight = false;

  constructor() {
    queueMicrotask(() => this.emit("message", { type: "ready" }));
  }

  on(event: string, handler: (value: any) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  postMessage(message: any): void {
    if (message.type === "configure") {
      this.configured = true;
      this.dispatch();
      return;
    }
    if (message.type === "enqueue") {
      this.queue.push(message.job);
      this.dispatch();
      return;
    }
    this.batchInFlight = false;
    this.dispatch();
  }

  terminate(): Promise<number> {
    return Promise.resolve(0);
  }

  private dispatch(): void {
    if (!this.configured || this.batchInFlight || this.queue.length <= 0) return;
    this.batchInFlight = true;
    const [job] = this.queue.splice(0, 1);
    queueMicrotask(() =>
      this.emit("message", {
        type: "dispatch_batch",
        jobs: [job],
        queueDepths: { human: 0, system: 0, ai: this.queue.length }
      })
    );
  }

  private emit(event: string, value: any): void {
    for (const handler of this.handlers.get(event) ?? []) handler(value);
  }
}

vi.mock("node:worker_threads", () => ({
  Worker: FakeWorker
}));

afterEach(() => {
  vi.resetModules();
});

describe("createSimulationService", () => {
  it("executes human frontier combat immediately instead of queueing it", async () => {
    const { createSimulationService } = await import("./service.js");
    const executeGatewayMessage = vi.fn(async () => true);
    const executeSystemCommand = vi.fn(async () => undefined);
    const queuedTasks: Array<() => void> = [];
    const service = createSimulationService<{ id: string }, { id: string }>({
      now: () => 1,
      drainBudgetMs: 10,
      drainMaxCommands: 4,
      drainHumanQuota: 1,
      drainSystemQuota: 1,
      drainAiQuota: 1,
      queueTask: (fn) => {
        queuedTasks.push(fn);
      },
      executeGatewayMessage,
      executeSystemCommand,
      onError: vi.fn(),
      noopSocket: { id: "noop" }
    });

    const actor = { id: "p1" };
    const socket = { id: "ws1" };

    expect(await service.handleGatewayMessage(actor, { type: "PING", t: 1 }, socket)).toBe(true);
    expect(executeGatewayMessage).toHaveBeenCalledTimes(1);
    expect(service.queueDepth()).toBe(0);

    executeGatewayMessage.mockClear();

    expect(await service.handleGatewayMessage(actor, { type: "ATTACK", fromX: 1, fromY: 1, toX: 2, toY: 2 }, socket)).toBe(true);
    expect(executeGatewayMessage).toHaveBeenCalledTimes(1);
    expect(executeGatewayMessage).toHaveBeenCalledWith(actor, { type: "ATTACK", fromX: 1, fromY: 1, toX: 2, toY: 2 }, socket);
    expect(service.queueDepth()).toBe(0);
    expect(queuedTasks).toHaveLength(0);
    expect(executeSystemCommand).not.toHaveBeenCalled();
  });

  it("still queues slower mutating messages behind the simulation worker", async () => {
    const { createSimulationService } = await import("./service.js");
    const executeGatewayMessage = vi.fn(async () => true);
    const executeSystemCommand = vi.fn(async () => undefined);
    const queuedTasks: Array<() => void> = [];
    const service = createSimulationService<{ id: string }, { id: string }>({
      now: () => 1,
      drainBudgetMs: 10,
      drainMaxCommands: 4,
      drainHumanQuota: 1,
      drainSystemQuota: 1,
      drainAiQuota: 1,
      queueTask: (fn) => {
        queuedTasks.push(fn);
      },
      executeGatewayMessage,
      executeSystemCommand,
      onError: vi.fn(),
      noopSocket: { id: "noop" }
    });

    const actor = { id: "p1" };
    const socket = { id: "ws1" };

    expect(await service.handleGatewayMessage(actor, { type: "BUILD_FORT", x: 2, y: 3 }, socket)).toBe(true);
    expect(executeGatewayMessage).toHaveBeenCalledTimes(0);
    expect(service.queueDepth()).toBe(1);
    expect(queuedTasks).toHaveLength(1);

    const drain = queuedTasks.shift();
    expect(drain).toBeTypeOf("function");
    drain?.();
    await Promise.resolve();

    expect(executeGatewayMessage).toHaveBeenCalledTimes(1);
    expect(executeGatewayMessage).toHaveBeenCalledWith(actor, { type: "BUILD_FORT", x: 2, y: 3 }, socket, true);
    expect(service.queueDepth()).toBe(0);
  });
});
