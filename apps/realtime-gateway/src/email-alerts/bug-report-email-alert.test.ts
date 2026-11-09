import { describe, expect, it } from "vitest";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
import { MAX_REPORT_ATTACHMENT_CHARS, buildPlayerReportEmail, sendPlayerReportEmail } from "./bug-report-email-alert.js";

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

  const capture = (statuses: number[]) => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response("rejected", { status: statuses[bodies.length - 1] ?? 200 });
    }) as typeof fetch;
    const errors: string[] = [];
    const config = {
      resendApiKey: "k", from: "a@b.c", to: "admin@b.c", fetchImpl,
      log: { error: (_payload: unknown, message?: string) => { errors.push(message ?? ""); } }
    };
    return { bodies, errors, config };
  };

  it("never rejects on malformed events — a throw here would be an unhandled rejection that kills the gateway", async () => {
    const { errors, config } = capture([]);
    const bad = { ...report(), clientEvents: [{ at: Number.NaN, level: "warn", scope: "x", event: "e", payload: {} }] };
    await expect(sendPlayerReportEmail("bug", bad, config)).resolves.toBeUndefined();
    expect(errors).toEqual(["failed to send bug report email"]);
  });

  it("swaps in a stub attachment for pathologically deep client context", async () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 1_000_000; i += 1) deep = [deep];
    const { bodies, config } = capture([]);
    await sendPlayerReportEmail("bug", { ...report(), clientContext: { deep } }, config);
    const [attachment] = bodies[0]?.attachments as Array<{ content: string }>;
    const decoded = JSON.parse(Buffer.from(attachment?.content ?? "", "base64").toString("utf8"));
    expect(decoded.reportId).toBe("abc-123");
    // Depending on the V8 build this either overflows the stack or exceeds the size cap; both must yield the stub.
    expect(decoded.attachmentOmitted).toEqual(expect.any(String));
  });

  it("swaps in a stub attachment when the report is too large", () => {
    const big = { blob: "x".repeat(MAX_REPORT_ATTACHMENT_CHARS) };
    const { attachment } = buildPlayerReportEmail("bug", { ...report(), metadata: big }, "staging");
    const decoded = JSON.parse(Buffer.from(attachment.content, "base64").toString("utf8"));
    expect(decoded.attachmentOmitted).toBe("too_large");
    expect(decoded.clientEvents).toBeUndefined();
  });

  it("retries without the attachment when Resend rejects it, so the summary still arrives", async () => {
    const { bodies, errors, config } = capture([422, 200]);
    await sendPlayerReportEmail("bug", report(), config);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.attachments).toBeDefined();
    expect(bodies[1]?.attachments).toBeUndefined();
    expect(bodies[1]?.text).toContain("Report ID: abc-123");
    expect(errors).toEqual(["bug report email with attachment rejected; retrying without"]);
  });
});
