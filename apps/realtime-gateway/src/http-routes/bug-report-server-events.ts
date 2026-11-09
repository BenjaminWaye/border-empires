import type { GatewayDebugEvent } from "./http-routes.js";

// The gateway ring buffer is shared by every connected player, so attaching it
// verbatim gives the reporter's events diluted by everyone else's. Keep:
//   - every event (any level) whose payload names the reporting player, and
//   - gateway-wide warnings/errors that aren't tied to another player,
// with separate budgets so other players' noise can't crowd the reporter out.
export const BUG_REPORT_PLAYER_EVENT_BUDGET = 70;
export const BUG_REPORT_GLOBAL_EVENT_BUDGET = 30;

const BUG_REPORT_LIFECYCLE_EVENTS = new Set([
  "player_connected", "player_disconnected", "command_submit",
  "sim_event_latency", "frontier_action_received"
]);

const eventPlayerId = (event: GatewayDebugEvent): string | undefined => {
  const value = event.payload.playerId;
  return typeof value === "string" ? value : undefined;
};

export const selectBugReportServerEvents = (events: readonly GatewayDebugEvent[], reporterPlayerId: string): GatewayDebugEvent[] => {
  // Without a known reporter we can't scope; fall back to the old filter
  // (warnings/errors plus lifecycle events) so the report isn't empty.
  if (reporterPlayerId === "unknown" || reporterPlayerId.length === 0) {
    return events
      .filter((e) => e.level !== "info" || BUG_REPORT_LIFECYCLE_EVENTS.has(e.event))
      .slice(-(BUG_REPORT_PLAYER_EVENT_BUDGET + BUG_REPORT_GLOBAL_EVENT_BUDGET));
  }
  const playerEvents = events.filter((e) => eventPlayerId(e) === reporterPlayerId).slice(-BUG_REPORT_PLAYER_EVENT_BUDGET);
  const globalEvents = events
    .filter((e) => e.level !== "info" && eventPlayerId(e) === undefined)
    .slice(-BUG_REPORT_GLOBAL_EVENT_BUDGET);
  return [...playerEvents, ...globalEvents].sort((a, b) => a.at - b.at);
};
