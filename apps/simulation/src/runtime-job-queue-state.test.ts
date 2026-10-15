import { describe, expect, it } from "vitest";

import { RuntimeJobQueue } from "./runtime-job-queue-state.js";

const createQueue = () => {
  const soon: Array<() => void> = [];
  const applied: string[] = [];
  const queue = new RuntimeJobQueue({
    backgroundBatchSize: 1,
    now: () => 0,
    scheduleSoon: (task) => soon.push(task),
    scheduleAfter: (_delayMs, task) => soon.push(task),
    shouldPauseBackground: undefined,
    wrapJobRun: undefined,
    onQueueDrain: undefined,
    onJobApplied: (sample) => applied.push(sample.lane)
  });
  const flush = () => {
    while (soon.length > 0) soon.shift()!();
  };
  return { queue, flush, applied };
};

describe("RuntimeJobQueue", () => {
  it("counts queued jobs per lane until a drain runs them", () => {
    const { queue, flush } = createQueue();
    const ran: string[] = [];
    queue.enqueue("ai", () => ran.push("ai"), undefined, "background");
    queue.enqueue("human_interactive", () => ran.push("human"));
    expect(queue.depths()).toEqual({ human_interactive: 1, human_noninteractive: 0, system: 0, ai: 1 });
    flush();
    expect(ran).toEqual(["human", "ai"]);
    expect(queue.depths()).toEqual({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 });
  });

  it("reports each applied job through onJobApplied", () => {
    const { queue, flush, applied } = createQueue();
    queue.enqueue("system", () => undefined);
    flush();
    expect(applied).toEqual(["system"]);
  });
});
