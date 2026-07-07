import { describe, expect, it } from "vitest";

import { createLagDiagnostics } from "./lag-diagnostics.js";

describe("lag diagnostics", () => {
  it("does not emit or ring-buffer info-level diagnostics", () => {
    const emitted: unknown[] = [];
    const { recordLagDiagnostic, getLagDiagRing } = createLagDiagnostics({
      emitLog: (level, message, payload) => emitted.push({ level, message, payload })
    });

    recordLagDiagnostic("info", "some_info_event", { durationMs: 5 });

    expect(emitted).toEqual([]);
    expect(getLagDiagRing()).toEqual([]);
  });

  it("emits and ring-buffers warn/error diagnostics with phase/durationMs pulled out", () => {
    const emitted: Array<{ level: string; message: string; payload: Record<string, unknown> }> = [];
    const { recordLagDiagnostic, getLagDiagRing } = createLagDiagnostics({
      emitLog: (level, message, payload) => emitted.push({ level, message, payload })
    });

    recordLagDiagnostic("warn", "simulation_command_apply_slow", { phase: "apply", durationMs: 400, commandId: "cmd-1" });

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ level: "warn", message: "simulation lag diagnostic: simulation_command_apply_slow" });

    const ring = getLagDiagRing();
    expect(ring).toHaveLength(1);
    expect(ring[0]).toMatchObject({ level: "warn", event: "simulation_command_apply_slow", phase: "apply", durationMs: 400 });
  });

  it("caps the ring buffer at 50 entries, dropping the oldest", () => {
    const { recordLagDiagnostic, getLagDiagRing } = createLagDiagnostics({ emitLog: () => undefined });

    for (let i = 0; i < 55; i += 1) {
      recordLagDiagnostic("warn", `event_${i}`, {});
    }

    const ring = getLagDiagRing();
    expect(ring).toHaveLength(50);
    expect(ring[0]?.event).toBe("event_5");
    expect(ring[ring.length - 1]?.event).toBe("event_54");
  });

  it("getLagDiagRing returns a defensive copy, not a live reference", () => {
    const { recordLagDiagnostic, getLagDiagRing } = createLagDiagnostics({ emitLog: () => undefined });
    recordLagDiagnostic("warn", "event_a", {});

    const first = getLagDiagRing();
    first.push({ at: 0, level: "warn", event: "injected" });

    expect(getLagDiagRing()).toHaveLength(1);
  });
});
