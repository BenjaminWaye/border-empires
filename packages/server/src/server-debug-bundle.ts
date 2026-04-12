export type ServerDebugEvent = {
  at: number;
  level: "info" | "warn" | "error";
  event: string;
  payload: Record<string, unknown>;
};

export type ServerDebugBundleStore = {
  record: (level: ServerDebugEvent["level"], event: string, payload: Record<string, unknown>) => void;
  snapshot: (limit?: number) => ServerDebugEvent[];
};

const MAX_SERVER_DEBUG_EVENTS = 300;

export const createServerDebugBundleStore = (
  maxEvents = MAX_SERVER_DEBUG_EVENTS
): ServerDebugBundleStore => {
  const events: ServerDebugEvent[] = [];

  return {
    record(level, event, payload) {
      events.push({
        at: Date.now(),
        level,
        event,
        payload
      });
      while (events.length > maxEvents) events.shift();
    },
    snapshot(limit = maxEvents) {
      return events.slice(-Math.max(1, limit));
    }
  };
};
