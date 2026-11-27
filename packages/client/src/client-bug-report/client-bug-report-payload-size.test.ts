import { describe, expect, it } from "vitest";
import { MAX_REPORT_BODY_BYTES, serializeReportPayloadWithinLimit } from "./client-bug-report-payload-size.js";

const payload = (over: Partial<Record<string, unknown>> = {}) => ({
  description: "map stuck",
  diagnosticsBundle: { incidentId: "diag-1" } as Record<string, unknown>,
  serverBundle: { ok: true, status: 200, body: {} } as unknown,
  clientEvents: [] as unknown[],
  performanceMetrics: {} as unknown,
  ...over
});

const bytes = (s: string): number => new TextEncoder().encode(s).length;

describe("serializeReportPayloadWithinLimit", () => {
  it("sends a normal payload unchanged", () => {
    const p = payload();
    expect(serializeReportPayloadWithinLimit(p)).toBe(JSON.stringify(p));
  });

  it("measures bytes, not characters: multibyte diagnostics under the char cap are still shed", () => {
    // 350k CJK chars = ~1.05 MB of UTF-8 — under any char cap, over the byte limit.
    const p = payload({ diagnosticsBundle: { recentTileMessages: ["界".repeat(350_000)] } });
    const body = serializeReportPayloadWithinLimit(p);
    expect(bytes(body)).toBeLessThanOrEqual(MAX_REPORT_BODY_BYTES);
    const parsed = JSON.parse(body);
    expect(parsed.description).toBe("map stuck");
    expect(parsed.diagnosticsBundle.omitted).toBe("body_limit");
  });

  it("sheds the server bundle and old client events too when the diagnostics alone aren't enough", () => {
    const big = "x".repeat(600_000);
    const p = payload({
      serverBundle: { ok: true, status: 200, body: big },
      clientEvents: Array.from({ length: 100 }, (_, i) => ({ i, pad: "y".repeat(10_000) }))
    });
    const parsed = JSON.parse(serializeReportPayloadWithinLimit(p));
    expect(parsed.serverBundle).toEqual({ ok: false, error: "omitted: body_limit" });
    expect(parsed.clientEvents).toHaveLength(20);
    expect(parsed.clientEvents[19].i).toBe(99);
  });
});
