import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../simulation-service/simulation-service.ts"), "utf8");
};

// Regression for "why was this specific command slow to apply" — the sim
// already measured apply duration in aggregate (sim_runtime_apply_ms) but had
// no way to correlate a single slow command back to what the main thread was
// doing during that window. This pins the wiring: commandApplyTracker tracks
// on submit, resolves in onJobApplied, and (when over threshold) logs with
// the actual main-thread-task-tracker snapshot for that window — not a proxy
// like wall time including async awaits (see state-and-persistence-discipline.md).
describe("simulation service command-apply diagnostics regression", () => {
  it("tracks every submitted command and resolves it in onJobApplied", () => {
    const file = source();

    expect(file).toContain(
      "const slowCommandApplyWarnMs = Math.max(50, Number(process.env.SIMULATION_SLOW_COMMAND_APPLY_WARN_MS ?? 300));"
    );
    expect(file).toContain("const commandApplyTracker = createCommandApplyTracker({ slowWarnMs: slowCommandApplyWarnMs });");
    expect(file).toContain("commandApplyTracker.track(command.commandId);");
  });

  it("logs simulation_command_apply_slow with the actual main-thread-task-tracker window, not a proxy", () => {
    const file = source();
    const onJobAppliedStart = file.indexOf("onJobApplied: (sample) => {");
    const onJobAppliedEnd = file.indexOf("wrapJobRun:");
    const onJobAppliedSource = file.slice(onJobAppliedStart, onJobAppliedEnd);

    expect(onJobAppliedSource).toContain("if (!sample.commandId) return;");
    expect(onJobAppliedSource).toContain("const diagnostic = commandApplyTracker.resolve(sample.commandId, sample.durationMs);");
    expect(onJobAppliedSource).toContain("if (!diagnostic) return;");
    expect(onJobAppliedSource).toContain('recordLagDiagnostic("warn", "simulation_command_apply_slow", {');
    expect(onJobAppliedSource).toContain("queueDepths: runtime.queueDepths(),");
    expect(onJobAppliedSource).toContain("queueBacklogMs: runtime.queueBacklogMs(),");
    expect(onJobAppliedSource).toContain("mainThreadTasks: mainThreadTasks.recentSince(diagnostic.submittedAt)");
  });

  it("exposes ai/system/human_noninteractive queue backlog gauges alongside the existing human_interactive one", () => {
    const file = source();

    expect(file).toContain("const queueBacklogMs = runtime.queueBacklogMs();");
    expect(file).toContain("simulationMetrics.setSimHumanInteractiveBacklogMs(queueBacklogMs.human_interactive);");
    expect(file).toContain("simulationMetrics.setSimBackgroundQueueBacklogMs({");
    expect(file).toContain("ai: queueBacklogMs.ai,");
    expect(file).toContain("system: queueBacklogMs.system,");
    expect(file).toContain("humanNoninteractive: queueBacklogMs.human_noninteractive");
  });

  it("exposes the commandApplyTracker's FIFO eviction counter so a leak cannot hide silently", () => {
    const file = source();

    expect(file).toContain("simulationMetrics.setSimCommandApplyTrackEvictedTotal(commandApplyTracker.evictedTotal());");
  });
});
