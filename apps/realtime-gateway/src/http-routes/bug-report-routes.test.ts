import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
import { registerBugReportRoutes, setBugReportAlerter } from "./bug-report-routes.js";

describe("POST /api/bug-reports", () => {
  it("forwards the client diagnostics bundle (which replaced the Download diagnostics button) to the alerters", async () => {
    const alertPlayerBugReport = vi.fn<(report: BugReportInput) => void>();
    setBugReportAlerter({ recentEvents: () => [], alertPlayerBugReport, alertPlayerSuggestion: vi.fn() });
    const app = Fastify();
    registerBugReportRoutes(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/bug-reports",
      payload: {
        description: "stuck on loading",
        clientContext: { me: "player-1", meName: "Waypoint" },
        metadata: { renderer: "2d-canvas" },
        clientEvents: [],
        diagnosticsBundle: { incidentId: "diag-1", state: { connection: "connecting" } }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(alertPlayerBugReport).toHaveBeenCalledTimes(1);
    expect(alertPlayerBugReport.mock.calls[0]![0].diagnostics).toEqual({ incidentId: "diag-1", state: { connection: "connecting" } });
    await app.close();
  });

  it("omits diagnostics when the client sends none", async () => {
    const alertPlayerBugReport = vi.fn<(report: BugReportInput) => void>();
    setBugReportAlerter({ recentEvents: () => [], alertPlayerBugReport, alertPlayerSuggestion: vi.fn() });
    const app = Fastify();
    registerBugReportRoutes(app);
    await app.inject({ method: "POST", url: "/api/bug-reports", payload: { description: "x", diagnosticsBundle: [1] } });
    expect(alertPlayerBugReport.mock.calls[0]![0]).not.toHaveProperty("diagnostics");
    await app.close();
  });
});
