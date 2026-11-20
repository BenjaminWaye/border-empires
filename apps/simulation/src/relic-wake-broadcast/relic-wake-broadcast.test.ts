import { describe, expect, it } from "vitest";
import { createRelicWakeBroadcast } from "./relic-wake-broadcast.js";

const setup = (failFor?: string) => {
  const tasks: Array<() => void> = [];
  const sent: string[] = [];
  const errors: string[] = [];
  const notify = createRelicWakeBroadcast({
    players: () => [{ id: "human", isAi: false }, { id: "offline", isAi: false }, { id: "ai", isAi: true }, { id: "human2", isAi: false }],
    isSubscribed: (id) => id !== "offline",
    schedule: (task) => { tasks.push(task); },
    emit: (id) => { if (id === failFor) throw new Error("boom"); sent.push(id); },
    onError: (_error, id) => { errors.push(id); }
  });
  return { tasks, sent, errors, notify };
};

// Review of #2899: the wake broadcast must not run in the command turn, spam offline or AI Houses, or crash the sim.
describe("relic wake broadcast", () => {
  it("defers to the scheduler and coalesces a burst into one broadcast", () => {
    const { tasks, sent, notify } = setup();
    notify(); notify(); notify();
    expect(sent).toEqual([]);
    expect(tasks).toHaveLength(1);
    tasks[0]!();
    notify();
    expect(tasks).toHaveLength(2);
  });

  it("sends only to subscribed human Houses", () => {
    const { tasks, sent, notify } = setup();
    notify(); tasks[0]!();
    expect(sent).toEqual(["human", "human2"]);
  });

  it("logs one House's failure and still updates the rest", () => {
    const { tasks, sent, errors, notify } = setup("human");
    notify();
    expect(() => tasks[0]!()).not.toThrow();
    expect(errors).toEqual(["human"]);
    expect(sent).toEqual(["human2"]);
  });
});
