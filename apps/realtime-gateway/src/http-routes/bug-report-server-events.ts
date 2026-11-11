import type { GatewayDebugEvent } from "./http-routes.js";

// The gateway ring buffer is shared by every connected player, so attaching it
// verbatim gives the reporter's events diluted by everyone else's. Keep:
//   - the reporter's own events (payload.playerId matches), warnings/errors
//     first so routine info traffic can't push them out, and
//   - gateway-wide warnings/errors that carry no playerId,
// with separate budgets so other players' noise can't crowd the reporter out.
export const BUG_REPORT_PLAYER_EVENT_BUDGET = 70;
export const BUG_REPORT_GLOBAL_EVENT_BUDGET = 30;

const eventPlayerId = (event: GatewayDebugEvent): string | undefined => {
  const value = event.payload.playerId;
  return typeof value === "string" ? value : undefined;
};

const isNotable = (event: GatewayDebugEvent): boolean => event.level !== "info";

const byTime = (a: GatewayDebugEvent, b: GatewayDebugEvent): number => a.at - b.at;

const selectReporterEvents = (events: readonly GatewayDebugEvent[], reporterPlayerId: string): GatewayDebugEvent[] => {
  const own = events.filter((e) => eventPlayerId(e) === reporterPlayerId);
  const notable = own.filter(isNotable).slice(-BUG_REPORT_PLAYER_EVENT_BUDGET);
  const infoBudget = BUG_REPORT_PLAYER_EVENT_BUDGET - notable.length;
  const info = infoBudget > 0 ? own.filter((e) => !isNotable(e)).slice(-infoBudget) : [];
  return [...notable, ...info];
};

export const selectBugReportServerEvents = (events: readonly GatewayDebugEvent[], reporterPlayerId: string): GatewayDebugEvent[] => {
  // Without a known reporter we can't scope: send only warnings/errors.
  if (reporterPlayerId === "unknown" || reporterPlayerId.length === 0) {
    return events.filter(isNotable).slice(-(BUG_REPORT_PLAYER_EVENT_BUDGET + BUG_REPORT_GLOBAL_EVENT_BUDGET));
  }
  const globalEvents = events
    .filter((e) => isNotable(e) && eventPlayerId(e) === undefined)
    .slice(-BUG_REPORT_GLOBAL_EVENT_BUDGET);
  return [...selectReporterEvents(events, reporterPlayerId), ...globalEvents].sort(byTime);
};
