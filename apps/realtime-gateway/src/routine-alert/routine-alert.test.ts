import { describe, expect, it, vi } from "vitest";

import { createRoutineAlertNotifier } from "./routine-alert.js";

const fakeFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) =>
  vi.fn(impl) as unknown as typeof fetch;

const flushPending = async (): Promise<void> => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

describe("createRoutineAlertNotifier", () => {
  it("is a no-op when fireUrl/fireToken are unset", async () => {
    const fetchImpl = fakeFetch(async () => new Response("ok", { status: 200 }));
    const notifier = createRoutineAlertNotifier({ fetchImpl });
    notifier.notify("lag alert");
    await flushPending();
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("POSTs the alert text with bearer auth when configured", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl = fakeFetch(async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ type: "routine_fire" }), { status: 200 });
    });
    const notifier = createRoutineAlertNotifier({
      fireUrl: "https://api.anthropic.com/v1/claude_code/routines/trig_123/fire",
      fireToken: "sk-ant-oat01-test",
      fetchImpl
    });
    notifier.notify("command submit latency p99 > 2500ms");
    await flushPending();

    expect(captured?.url).toBe("https://api.anthropic.com/v1/claude_code/routines/trig_123/fire");
    expect((captured?.init.headers as Record<string, string>).authorization).toBe("Bearer sk-ant-oat01-test");
    expect(JSON.parse(captured?.init.body as string)).toEqual({ text: "command submit latency p99 > 2500ms" });
  });

  it("fires once for a sustained incident, no matter how many breaches are reported", async () => {
    let nowMs = 1000;
    let callCount = 0;
    const fetchImpl = fakeFetch(async () => {
      callCount += 1;
      return new Response("ok", { status: 200 });
    });
    const notifier = createRoutineAlertNotifier({
      fireUrl: "https://example.com/fire",
      fireToken: "token",
      resolveAfterMs: 20_000,
      fetchImpl,
      now: () => nowMs
    });

    notifier.notify("first breach");
    await flushPending();
    expect(callCount).toBe(1);

    // Repeated breaches every 5s for a full minute — still the same incident.
    for (let i = 0; i < 12; i++) {
      nowMs += 5_000;
      notifier.notify(`breach #${i}`);
      await flushPending();
    }
    expect(callCount).toBe(1);
  });

  it("fires again once the incident goes quiet for resolveAfterMs and a new breach occurs", async () => {
    let nowMs = 1000;
    let callCount = 0;
    const fetchImpl = fakeFetch(async () => {
      callCount += 1;
      return new Response("ok", { status: 200 });
    });
    const notifier = createRoutineAlertNotifier({
      fireUrl: "https://example.com/fire",
      fireToken: "token",
      resolveAfterMs: 10_000,
      fetchImpl,
      now: () => nowMs
    });

    notifier.notify("first incident");
    await flushPending();
    expect(callCount).toBe(1);

    nowMs += 11_000; // quiet period exceeds resolveAfterMs
    notifier.notify("new incident");
    await flushPending();
    expect(callCount).toBe(2);
  });

  it("posts the session link to Slack when the fire succeeds and slackWebhookUrl is set", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = fakeFetch(async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      if (url === "https://example.com/fire") {
        return new Response(
          JSON.stringify({ type: "routine_fire", claude_code_session_url: "https://claude.ai/code/session_abc" }),
          { status: 200 }
        );
      }
      return new Response("ok", { status: 200 });
    });
    const notifier = createRoutineAlertNotifier({
      fireUrl: "https://example.com/fire",
      fireToken: "token",
      slackWebhookUrl: "https://example.com/slack-hook",
      fetchImpl
    });
    notifier.notify("lag alert");
    await flushPending();

    const slackCall = calls.find((c) => c.url === "https://example.com/slack-hook");
    expect(slackCall).toBeDefined();
    expect((slackCall?.body as { text: string }).text).toContain("https://claude.ai/code/session_abc");
  });

  it("logs and does not throw when the POST fails", async () => {
    const log = { error: vi.fn() };
    const fetchImpl = fakeFetch(async () => new Response("nope", { status: 500 }));
    const notifier = createRoutineAlertNotifier({
      fireUrl: "https://example.com/fire",
      fireToken: "token",
      fetchImpl,
      log
    });
    notifier.notify("lag alert");
    await flushPending();
    expect(log.error).toHaveBeenCalled();
  });
});
