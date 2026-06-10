/**
 * Lightweight per-request span tracer.
 *
 * Disabled by default. Enable in staging by setting GATEWAY_TRACE_REQUESTS=1.
 *
 * Each tracer instance wraps one request (login AUTH or expand command). It
 * mints a correlationId at construction and emits one structured JSON line to
 * stdout per stage. Every line carries the correlationId so a complete request
 * trace can be extracted with: flyctl logs | grep <correlationId>
 *
 * Intentionally low ceremony — no transport, no sampling, no dependencies.
 * Log lines are JSON-over-stdout like the rest of pino.
 */

const ENABLED = process.env.GATEWAY_TRACE_REQUESTS === "1";

const emit = (fields: Record<string, unknown>): void => {
  process.stdout.write(JSON.stringify({ level: 30, time: Date.now(), ...fields }) + "\n");
};

export type RequestTracer = {
  correlationId: string;
  stage: (name: string, extra?: Record<string, unknown>) => void;
  done: (extra?: Record<string, unknown>) => void;
};

const noopTracer = (correlationId: string): RequestTracer => ({
  correlationId,
  stage: () => undefined,
  done: () => undefined
});

export const createRequestTracer = (params: {
  kind: "login" | "expand";
  correlationId: string;
  playerId?: string;
  extra?: Record<string, unknown>;
}): RequestTracer => {
  const startedAt = Date.now();

  if (!ENABLED) return noopTracer(params.correlationId);

  const base = {
    msg: "request_trace",
    traceKind: params.kind,
    correlationId: params.correlationId,
    ...(params.playerId ? { playerId: params.playerId } : {}),
    ...(params.extra ?? {})
  };

  emit({ ...base, stage: "start", elapsedMs: 0 });

  return {
    correlationId: params.correlationId,
    stage(name: string, extra?: Record<string, unknown>): void {
      emit({ ...base, stage: name, elapsedMs: Date.now() - startedAt, ...(extra ?? {}) });
    },
    done(extra?: Record<string, unknown>): void {
      emit({ ...base, stage: "done", elapsedMs: Date.now() - startedAt, ...(extra ?? {}) });
    }
  };
};
