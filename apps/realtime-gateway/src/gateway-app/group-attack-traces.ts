import type { GatewayDebugEvent, GatewayAttackTrace } from "../http-routes/http-routes.js";

export const groupAttackTraces = (source: GatewayDebugEvent[]): GatewayAttackTrace[] => {
  const grouped = new Map<string, GatewayDebugEvent[]>();
  for (const event of source) {
    const commandId = typeof event.payload.commandId === "string" ? event.payload.commandId : undefined;
    if (!commandId) continue;
    const existing = grouped.get(commandId);
    if (existing) existing.push(event);
    else grouped.set(commandId, [event]);
  }
  return [...grouped.entries()]
    .map(([traceId, events]) => {
      const sortedEvents = [...events].sort((left, right) => left.at - right.at);
      return {
        traceId,
        firstAt: sortedEvents[0]?.at ?? 0,
        lastAt: sortedEvents[sortedEvents.length - 1]?.at ?? 0,
        events: sortedEvents
      };
    })
    .sort((left, right) => right.lastAt - left.lastAt);
};
