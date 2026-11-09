import { describe, expect, it } from "vitest";
import type { GatewayDebugEvent } from "./http-routes.js";
import {
  BUG_REPORT_GLOBAL_EVENT_BUDGET,
  BUG_REPORT_PLAYER_EVENT_BUDGET,
  selectBugReportServerEvents
} from "./bug-report-server-events.js";

const ev = (at: number, level: GatewayDebugEvent["level"], event: string, payload: Record<string, unknown> = {}): GatewayDebugEvent => ({
  at,
  level,
  event,
  payload
});

describe("selectBugReportServerEvents", () => {
  it("keeps the reporter's events at every level and drops other players' events", () => {
    const events = [
      ev(1, "info", "command_submit", { playerId: "player-1" }),
      ev(2, "info", "command_submit", { playerId: "player-2" }),
      ev(3, "warn", "command_rejected", { playerId: "player-2" }),
      ev(4, "info", "snapshot_sent", { playerId: "player-1" }),
      ev(5, "error", "sim_unavailable"),
      ev(6, "info", "metrics_tick")
    ];
    expect(selectBugReportServerEvents(events, "player-1").map((e) => e.at)).toEqual([1, 4, 5]);
  });

  it("caps each budget separately so other traffic can't crowd out the reporter", () => {
    const events: GatewayDebugEvent[] = [];
    for (let i = 0; i < 200; i += 1) events.push(ev(i * 2, "info", "command_submit", { playerId: "player-1" }));
    for (let i = 0; i < 200; i += 1) events.push(ev(i * 2 + 1, "warn", "gateway_slow"));
    const selected = selectBugReportServerEvents(events, "player-1");
    expect(selected.filter((e) => e.payload.playerId === "player-1")).toHaveLength(BUG_REPORT_PLAYER_EVENT_BUDGET);
    expect(selected.filter((e) => e.level === "warn")).toHaveLength(BUG_REPORT_GLOBAL_EVENT_BUDGET);
    expect(selected.map((e) => e.at)).toEqual([...selected.map((e) => e.at)].sort((a, b) => a - b));
  });

  it("falls back to warnings/errors only when the reporter is unknown", () => {
    const events = [
      ev(1, "info", "command_submit", { playerId: "player-2" }),
      ev(2, "info", "metrics_tick"),
      ev(3, "warn", "command_rejected", { playerId: "player-2" })
    ];
    expect(selectBugReportServerEvents(events, "unknown").map((e) => e.at)).toEqual([3]);
  });

  it("keeps the reporter's older errors even when later info traffic exceeds the budget", () => {
    const events = [ev(0, "error", "gateway_fog_refresh_failed", { playerId: "player-1" })];
    for (let i = 1; i <= 200; i += 1) events.push(ev(i, "info", "gateway_simulation_event_received", { playerId: "player-1" }));
    const selected = selectBugReportServerEvents(events, "player-1");
    expect(selected[0]?.event).toBe("gateway_fog_refresh_failed");
    expect(selected).toHaveLength(BUG_REPORT_PLAYER_EVENT_BUDGET);
    expect(selected.at(-1)?.at).toBe(200);
  });
});
