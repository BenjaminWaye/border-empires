export type ServerDebugEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
};

export type ServerAttackTrace = {
  traceId: string;
  firstAt: number;
  lastAt: number;
  playerId?: string;
  actionType?: string;
  origin?: unknown;
  target?: unknown;
  events: ServerDebugEvent[];
};

export type ServerDebugBundleStore = {
  record: (level: ServerDebugEvent["level"], event: string, payload: Record<string, unknown>) => void;
  snapshot: (limit?: number) => ServerDebugEvent[];
  snapshotAttackTraces: (limit?: number) => ServerAttackTrace[];
};

const MAX_SERVER_DEBUG_EVENTS = 300;
const MAX_SERVER_ATTACK_TRACES = 120;
const MAX_SERVER_EVENTS_PER_TRACE = 40;

export const createServerDebugBundleStore = (
  maxEvents = MAX_SERVER_DEBUG_EVENTS
): ServerDebugBundleStore => {
  const events: ServerDebugEvent[] = [];
  const attackTraceOrder: string[] = [];
  const attackTraces = new Map<string, ServerAttackTrace>();

  const touchAttackTrace = (traceId: string): ServerAttackTrace => {
    const existing = attackTraces.get(traceId);
    if (existing) {
      const existingIndex = attackTraceOrder.indexOf(traceId);
      if (existingIndex >= 0) attackTraceOrder.splice(existingIndex, 1);
      attackTraceOrder.push(traceId);
      return existing;
    }
    const created: ServerAttackTrace = {
      traceId,
      firstAt: 0,
      lastAt: 0,
      events: []
    };
    attackTraces.set(traceId, created);
    attackTraceOrder.push(traceId);
    while (attackTraceOrder.length > MAX_SERVER_ATTACK_TRACES) {
      const oldestTraceId = attackTraceOrder.shift();
      if (oldestTraceId) attackTraces.delete(oldestTraceId);
    }
    return created;
  };

  return {
    record(level, event, payload) {
      const debugEvent: ServerDebugEvent = {
        at: Date.now(),
        level,
        event,
        payload
      };
      events.push(debugEvent);
      while (events.length > maxEvents) events.shift();
      const traceId = typeof payload.traceId === "string" ? payload.traceId : "";
      if (!traceId) return;
      const trace = touchAttackTrace(traceId);
      if (trace.firstAt === 0) trace.firstAt = debugEvent.at;
      trace.lastAt = debugEvent.at;
      if (typeof payload.playerId === "string") trace.playerId = payload.playerId;
      if (typeof payload.actionType === "string") trace.actionType = payload.actionType;
      if ("origin" in payload) trace.origin = payload.origin;
      if ("from" in payload && trace.origin === undefined) trace.origin = payload.from;
      if ("target" in payload) trace.target = payload.target;
      trace.events.push(debugEvent);
      while (trace.events.length > MAX_SERVER_EVENTS_PER_TRACE) trace.events.shift();
    },
    snapshot(limit = maxEvents) {
      return events.slice(-Math.max(1, limit));
    },
    snapshotAttackTraces(limit = MAX_SERVER_ATTACK_TRACES) {
      return attackTraceOrder
        .slice(-Math.max(1, limit))
        .map((traceId) => attackTraces.get(traceId))
        .filter((trace): trace is ServerAttackTrace => Boolean(trace))
        .map((trace) => ({
          ...trace,
          events: [...trace.events]
        }));
    }
  };
};
