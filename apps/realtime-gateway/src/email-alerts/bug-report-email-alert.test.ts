import { describe, expect, it } from "vitest";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
import { buildPlayerReportEmail, sendPlayerReportEmail } from "./bug-report-email-alert.js";

const report = (): BugReportInput => ({
  reportId: "abc-123",
  description: "Season summary is missing historical data: Score timeline.",
  playerName: "Waypoint",
  playerId: "player-1",
  clientEvents: [
    { at: 1_000, level: "info", scope: "season", event: "summary_opened", payload: {} },
    { at: 2_000, level: "error", scope: "season", event: "timeline_fetch_failed", payload: { status: 404 } }
  ],
  serverEvents: [
    { at: 1_500, level: "warn", event: "command_rejected", payload: { playerId: "player-1", commandId: "cmd-9" } }
  ],
  clientContext: { bridgeDebugServerBuildSha: "deadbeef", bridgeDebugSeasonId: "season-7", connection: "connected" },
  metadata: { renderer: "true-3d", pageUrl: "https://borderempires.com/", userAgent: "TestAgent/1" }
});

describe("buildPlayerReportEmail", () => {
  it("attaches the full report, including every event payload, as JSON", () => {
    const { attachment } = buildPlayerReportEmail("bug", report(), "staging");
    expect(attachment.filename).toBe("bug-report-abc-123.json");
    const decoded = JSON.parse(Buffer.from(attachment.content, "base64").toString("utf8"));
    expect(decoded).toEqual({ kind: "bug", ...report() });
    expect(decoded.clientEvents[1].payload).toEqual({ status: 404 });
    expect(decoded.serverEvents[0].payload.commandId).toBe("cmd-9");
  });

  it("puts build, season, renderer and the notable events in the body, not just counts", () => {
    const { text } = buildPlayerReportEmail("bug", report(), "staging");
    expect(text).toContain("Report ID: abc-123");
    expect(text).toContain("Server build: deadbeef");
    expect(text).toContain("Season: season-7");
    expect(text).toContain("Renderer: true-3d");
    expect(text).toContain("Server events: 1 total (0 errors, 1 warnings)");
    expect(text).toContain("Client events: 2 total (1 errors, 0 warnings)");
    expect(text).toContain("[warn] command_rejected cmd:cmd-9");
    expect(text).toContain("[error] season/timeline_fetch_failed");
    expect(text).not.toContain("summary_opened");
  });

  it("falls back to 'unknown' for missing context fields", () => {
    const { text } = buildPlayerReportEmail("suggestion", { ...report(), clientContext: {}, metadata: {} }, "staging");
    expect(text).toContain("Server build: unknown");
    expect(text).toContain("Renderer: unknown");
  });
});

describe("sendPlayerReportEmail", () => {
  it("sends the JSON attachment to Resend", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    await sendPlayerReportEmail("bug", report(), { resendApiKey: "k", from: "a@b.c", to: "admin@b.c", fetchImpl });

    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.attachments).toEqual([
      expect.objectContaining({ filename: "bug-report-abc-123.json", content: expect.any(String) })
    ]);
  });
});
