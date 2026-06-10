/**
 * Sim-side per-request span tracer (mirrors gateway's request-tracer.ts).
 *
 * Enabled by SIMULATION_TRACE_REQUESTS=1. Emits one JSON line per stage so
 * a full expand trace (gateway + sim) can be assembled by correlationId:
 *   flyctl logs | grep <commandId>
 */

const ENABLED = process.env.SIMULATION_TRACE_REQUESTS === "1";

const emit = (fields: Record<string, unknown>): void => {
  process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), ...fields }) + "\n");
};

export type SimRequestTracer = {
  stage: (name: string, extra?: Record<string, unknown>) => void;
  done: (extra?: Record<string, unknown>) => void;
};

const noopTracer: SimRequestTracer = {
  stage: () => undefined,
  done: () => undefined
};

export const createSimRequestTracer = (params: {
  commandId: string;
  commandType: string;
  playerId: string;
  lane: string;
}): SimRequestTracer => {
  if (!ENABLED) return noopTracer;

  const startedAt = Date.now();
  const base = {
    msg: "sim_request_trace",
    correlationId: params.commandId,
    commandId: params.commandId,
    commandType: params.commandType,
    playerId: params.playerId,
    lane: params.lane
  };
  emit({ ...base, stage: "sim_accepted", elapsedMs: 0 });

  return {
    stage(name: string, extra?: Record<string, unknown>): void {
      emit({ ...base, stage: name, elapsedMs: Date.now() - startedAt, ...(extra ?? {}) });
    },
    done(extra?: Record<string, unknown>): void {
      emit({ ...base, stage: "sim_done", elapsedMs: Date.now() - startedAt, ...(extra ?? {}) });
    }
  };
};
