import { describe, expect, it, vi } from "vitest";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
import { buildPlayerReportIssue, createPlayerReportGithubIssue } from "./player-report-github-issue.js";

const report = (description = "Map stuck loading after login.\nSecond line @someone #12"): BugReportInput => ({
  reportId: "abc-123",
  description,
  playerName: "Waypoint",
  playerId: "player-42",
  clientEvents: [
    { at: 1_000, level: "info", scope: "map", event: "chunk_received", payload: {} },
    { at: 2_000, level: "error", scope: "map", event: "chunk_timeout", payload: { cx: 1 } }
  ],
  serverEvents: [{ at: 1_500, level: "warn", event: "command_rejected", payload: { playerId: "player-42" } }],
  clientContext: { bridgeDebugServerBuildSha: "deadbeef", bridgeDebugSeasonId: "season-7", connection: "connected", meName: "Waypoint" },
  metadata: { renderer: "true-3d", pageUrl: "https://borderempires.com/?token=secret", userAgent: "TestAgent/1" }
});

const okResponse = (): Response => new Response("{}", { status: 201 });

describe("buildPlayerReportIssue", () => {
  it("builds a one-line title, labels by kind, and triage context", () => {
    const issue = buildPlayerReportIssue("bug", report(), "production");
    expect(issue.title).toBe("[Bug] Map stuck loading after login. Second line @someone #12");
    expect(issue.labels).toEqual(["player-report", "bug"]);
    expect(issue.body).toContain("Report ID: abc-123");
    expect(issue.body).toContain("Environment: production");
    expect(issue.body).toContain("Server build: deadbeef");
    expect(issue.body).toContain("[error] map/chunk_timeout");
    expect(buildPlayerReportIssue("suggestion", report(), "x").labels).toEqual(["player-report", "enhancement"]);
  });

  it("keeps player identity and the page URL out of a possibly public issue", () => {
    const { body, title } = buildPlayerReportIssue("bug", report(), "production");
    for (const text of [body, title]) {
      expect(text).not.toContain("Waypoint");
      expect(text).not.toContain("player-42");
      expect(text).not.toContain("token=secret");
    }
  });

  it("fences untrusted description text so it cannot break out of the code block", () => {
    const { body } = buildPlayerReportIssue("bug", report("before\n~~~~\n@everyone ping"), "production");
    expect(body).toContain("~~~~~text\nbefore\n~~~~\n@everyone ping\n~~~~~");
  });

  it("truncates long descriptions in the title", () => {
    const { title } = buildPlayerReportIssue("bug", report("x".repeat(500)), "p");
    expect(title.length).toBeLessThanOrEqual("[Bug] ".length + 80);
  });
});

describe("createPlayerReportGithubIssue", () => {
  it("posts the issue to the configured repo with the token", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    await createPlayerReportGithubIssue("bug", report(), { token: "tok", repo: "acme/game", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/game/issues");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body)).labels).toEqual(["player-report", "bug"]);
  });

  it("retries without labels when GitHub rejects them", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("bad label", { status: 422 }))
      .mockResolvedValueOnce(okResponse());
    const error = vi.fn();
    await createPlayerReportGithubIssue("bug", report(), { token: "tok", repo: "acme/game", fetchImpl, log: { error } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchImpl.mock.calls[1] as [string, RequestInit])[1].body)).labels).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("never throws and logs when GitHub is unreachable", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("network down"); });
    const error = vi.fn();
    await expect(
      createPlayerReportGithubIssue("bug", report(), { token: "tok", repo: "acme/game", fetchImpl, log: { error } })
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ err: "network down" }), "failed to create bug report GitHub issue");
  });

  it("does nothing for a malformed repo", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    await createPlayerReportGithubIssue("bug", report(), { token: "tok", repo: "../evil", fetchImpl });
    await createPlayerReportGithubIssue("bug", report(), { token: "tok", repo: "acme/..", fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
