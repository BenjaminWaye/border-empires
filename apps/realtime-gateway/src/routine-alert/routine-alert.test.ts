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

  it("respects the cooldown between fires", async () => {
    let nowMs = 1000;
    let callCount = 0;
    const fetchImpl = fakeFetch(async () => {
      callCount += 1;
      return new Response("ok", { status: 200 });
    });
    const notifier = createRoutineAlertNotifier({
      fireUrl: "https://example.com/fire",
      fireToken: "token",
      cooldownMs: 10_000,
      fetchImpl,
      now: () => nowMs
    });

    notifier.notify("first");
    await flushPending();
    expect(callCount).toBe(1);

    nowMs += 5_000;
    notifier.notify("second, within cooldown");
    await flushPending();
    expect(callCount).toBe(1);

    nowMs += 6_000;
    notifier.notify("third, cooldown elapsed");
    await flushPending();
    expect(callCount).toBe(2);
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
