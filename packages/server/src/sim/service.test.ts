import { describe, expect, it, vi } from "vitest";

import { createSimulationService } from "./service.js";

describe("createSimulationService", () => {
  it("queues mutating gameplay messages and executes non-queued messages directly", async () => {
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
    expect(executeGatewayMessage).not.toHaveBeenCalled();
    expect(service.queueDepth()).toBe(1);
    expect(queuedTasks).toHaveLength(1);

    await queuedTasks.shift()?.();

    expect(executeGatewayMessage).toHaveBeenCalledTimes(1);
    expect(executeGatewayMessage).toHaveBeenCalledWith(actor, { type: "ATTACK", fromX: 1, fromY: 1, toX: 2, toY: 2 }, socket, true);
    expect(service.queueDepth()).toBe(0);
    expect(executeSystemCommand).not.toHaveBeenCalled();
  });
});
