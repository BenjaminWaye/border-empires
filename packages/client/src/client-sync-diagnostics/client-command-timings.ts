import type { DebugEvent } from "../client-debug/client-debug-incidents.js";

type ServerEvent = { at: number; event: string; payload: Record<string, unknown> };
const clock = (event: DebugEvent): number | undefined =>
  typeof event.payload.monotonicAtMs === "number" ? event.payload.monotonicAtMs : undefined;
const elapsed = (start: DebugEvent | undefined, end: DebugEvent | undefined): number | undefined => {
  const a = start && clock(start);
  const b = end && clock(end);
  return a !== undefined && b !== undefined ? b - a : undefined;
};

export const buildCommandTimings = (events: DebugEvent[], serverEvents: ServerEvent[]) => {
  const sends = events.filter((event) => event.event === "wire-sent" &&
    ["ATTACK", "EXPAND"].includes(String(event.payload.type)) && typeof event.payload.commandId === "string");
  // Incident windows overlap the main ring. Emit each command once.
  return [...new Map(sends.map((event) => [event.payload.commandId, event])).values()].slice(-100).map((sent) => {
    const commandId = sent.payload.commandId;
    const own = events.filter((event) => event.payload.commandId === commandId);
    const received = (type: string) => own.find((event) => event.event === "wire-received" && event.payload.type === type);
    const server = serverEvents.filter((event) => event.payload.commandId === commandId);
    const arrived = server.find((event) => event.event === "gateway_frontier_received") ??
      server.find((event) => event.event === "gateway_frontier_stage" && event.payload.stage === "received");
    const accepted = server.find((event) => event.event === "gateway_command_payload_sent" && event.payload.payloadType === "ACTION_ACCEPTED");
    const applied = own.find((event) => event.event === "wire-applied" && event.payload.type === "ACTION_ACCEPTED");
    return {
      commandId, clientSeq: sent.payload.clientSeq, sentAt: sent.at,
      clientSendToQueuedMs: elapsed(sent, received("COMMAND_QUEUED")),
      clientSendToAcceptedMs: elapsed(sent, received("ACTION_ACCEPTED")),
      // Includes gateway persistence; this is not a pure network ping.
      acceptedHandlerMs: applied?.payload.handlerMs,
      serverReceivedToAcceptedSendMs: arrived && accepted ? accepted.at - arrived.at : undefined,
      serverStages: server.filter((event) => event.event === "gateway_frontier_stage").map((event) => ({
        stage: event.payload.stage, elapsedMs: event.payload.elapsedMs,
        eventLoopMaxMs: event.payload.eventLoopMaxMs, backlogPendingCount: event.payload.backlogPendingCount
      }))
    };
  });
};
