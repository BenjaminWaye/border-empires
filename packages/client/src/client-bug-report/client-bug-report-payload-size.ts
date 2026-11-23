// Keeps a bug-report POST under the gateway's request body limit (Fastify's
// default is 1 MiB, measured in bytes of the whole JSON body). A report over
// the limit gets a 413 and is lost entirely, description included, so the
// bulkiest, least essential parts are shed until the body fits.

export const MAX_REPORT_BODY_BYTES = 900_000;

type SheddablePayload = {
  diagnosticsBundle: Record<string, unknown>;
  serverBundle: unknown;
  clientEvents: unknown[];
  performanceMetrics: unknown;
};

const utf8Length = (text: string): number => new TextEncoder().encode(text).length;

// Returns the JSON body to send. Shedding order: the diagnostics bundle (the
// old "Download diagnostics" file), then the server diagnostics fetch, then
// all but the most recent client events, then performance metrics.
export const serializeReportPayloadWithinLimit = <T extends SheddablePayload>(
  payload: T,
  maxBytes: number = MAX_REPORT_BODY_BYTES
): string => {
  let current: T = payload;
  let json = JSON.stringify(current);
  const originalBytes = utf8Length(json);
  const steps: Array<(p: T) => T> = [
    (p) => ({ ...p, diagnosticsBundle: { omitted: "body_limit", originalBytes } }),
    (p) => ({ ...p, serverBundle: { ok: false, error: "omitted: body_limit" } }),
    (p) => ({ ...p, clientEvents: p.clientEvents.slice(-20) }),
    (p) => ({ ...p, performanceMetrics: { omitted: "body_limit" } })
  ];
  for (const shed of steps) {
    if (utf8Length(json) <= maxBytes) return json;
    current = shed(current);
    json = JSON.stringify(current);
  }
  return json;
};
