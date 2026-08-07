import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../simulation-service/simulation-service.ts"), "utf8");
};

// Regression for /admin/debug/ai's recentCommands (and GetRecentCommands in
// general) always returning empty. commandStore.persistQueuedCommand was
// defined and read back via loadAllCommands(), but nothing ever called it —
// markAccepted/markRejected (wired via persistenceQueue.enqueueEvent in the
// runtime.onEvent handler) ran against a row that was never inserted and
// silently no-opped. See simulation-persistence-queue.ts's
// enqueueQueuedCommand for the fix and its unit tests for the persisted-row
// behavior; this pins that submitDurableCommand actually calls it, in the
// right order relative to runtime.submitCommand (which synchronously fires
// the COMMAND_ACCEPTED/COMMAND_REJECTED event that depends on the row
// existing).
describe("simulation service queued-command persistence regression", () => {
  it("persists the QUEUED row before applying the command", () => {
    const file = source();
    const submitDurableCommandStart = file.indexOf("const submitDurableCommand = async (command: CommandEnvelope): Promise<void> => {");
    const submitDurableCommandEnd = file.indexOf("const autopilotMaxPersistencePending");
    const submitDurableCommandSource = file.slice(submitDurableCommandStart, submitDurableCommandEnd);

    expect(submitDurableCommandStart).toBeGreaterThan(-1);
    const enqueueQueuedCommandIndex = submitDurableCommandSource.indexOf("persistenceQueue.enqueueQueuedCommand(command, runtimeSubmitStartedAt);");
    const runtimeSubmitCommandIndex = submitDurableCommandSource.indexOf("runtime.submitCommand(command);");

    expect(enqueueQueuedCommandIndex).toBeGreaterThan(-1);
    expect(runtimeSubmitCommandIndex).toBeGreaterThan(-1);
    // enqueueQueuedCommand must be called before runtime.submitCommand, since
    // submitCommand synchronously fires the ACCEPTED/REJECTED event that
    // updates the same row via the persistence queue's drain ordering.
    expect(enqueueQueuedCommandIndex).toBeLessThan(runtimeSubmitCommandIndex);
  });
});
