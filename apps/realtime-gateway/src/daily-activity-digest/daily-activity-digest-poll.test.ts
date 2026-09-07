import { describe, expect, it, vi } from "vitest";

import { startDailyActivityDigestPoll } from "./daily-activity-digest-poll.js";

const activityResponse = {
  generatedAt: "2026-09-04T05:00:00.000Z",
  dailyStory: [{ headline: "War declared", text: "Alice declared war on Bob." }],
  powerScore: [
    { rank: 1, name: "Alice", score: 100 },
    { rank: 2, name: "Bob", score: 80 }
  ]
};

describe("startDailyActivityDigestPoll", () => {
  it("schedules the next fire for 07:00 Europe/Stockholm, not a fixed 24h interval", () => {
    // 2026-09-04T05:30:00Z is 07:30 in Stockholm (CEST, UTC+2) -- past today's
    // 07:00 fire, so the next one should be ~23.5h away, not exactly 24h.
    const nowMs = new Date("2026-09-04T05:30:00.000Z").getTime();
    const scheduleTimeout = vi.fn().mockReturnValue(0 as unknown as ReturnType<typeof setTimeout>);
    const poll = startDailyActivityDigestPoll({
      getBaseUrl: () => "http://127.0.0.1:1",
      webhookUrl: "https://hooks.example/webhook",
      now: () => nowMs,
      scheduleTimeout
    });

    expect(scheduleTimeout).toHaveBeenCalledTimes(1);
    const delayMs = scheduleTimeout.mock.calls[0]![1] as number;
    expect(delayMs).toBeCloseTo(23.5 * 60 * 60 * 1000, -3);
    poll.stop();
  });

  it("fetches /api/activity over the gateway's own loopback address and posts the digest to Slack, without ever hitting GitHub Actions", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === "http://127.0.0.1:1/api/activity") {
        return new Response(JSON.stringify(activityResponse), { status: 200 });
      }
      if (url === "https://hooks.example/webhook") {
        return new Response("ok", { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    let firedFn: (() => void) | undefined;
    const scheduleTimeout = vi.fn((fn: () => void) => {
      firedFn = fn;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });

    const poll = startDailyActivityDigestPoll({
      getBaseUrl: () => "http://127.0.0.1:1",
      webhookUrl: "https://hooks.example/webhook",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      scheduleTimeout
    });

    expect(firedFn).toBeDefined();
    firedFn!();
    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith("https://hooks.example/webhook", expect.objectContaining({ method: "POST" }));
    });

    const slackCall = fetchImpl.mock.calls.find(([url]) => url === "https://hooks.example/webhook")!;
    const body = JSON.parse((slackCall[1] as RequestInit).body as string);
    expect(body.text).toContain("War declared");
    expect(body.text).toContain("Alice");

    poll.stop();
  });

  it("is a no-op when no webhook URL is configured", async () => {
    const fetchImpl = vi.fn();
    let firedFn: (() => void) | undefined;
    const poll = startDailyActivityDigestPoll({
      getBaseUrl: () => "http://127.0.0.1:1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      scheduleTimeout: (fn) => {
        firedFn = fn;
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
    });

    firedFn!();
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();
    poll.stop();
  });
});
