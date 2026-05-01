import { snapshotClientDebugEvents } from "./client-debug.js";
import { buildClientDebugBundle, serverHttpOriginFromWsUrl } from "./client-debug-bundle.js";
import type { ClientState } from "./client-state.js";
import type { PlayerRespawnNotice } from "./client-types.js";

type JsonFetchResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status?: number; error: string };

const FETCH_TIMEOUT_MS = 4_000;

const saveJsonFile = (filename: string, payload: unknown): void => {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
};

const withTimeout = async (url: string): Promise<JsonFetchResult> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: typeof (body as { message?: unknown } | undefined)?.message === "string" ? (body as { message: string }).message : `HTTP ${response.status}`
      };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const timestampToken = (): string => new Date().toISOString().replace(/[:.]/g, "-");

export const downloadRespawnReasonReport = (notice: PlayerRespawnNotice): void => {
  saveJsonFile(`border-empires-respawn-reason-${notice.id}-${timestampToken()}.json`, {
    generatedAt: new Date().toISOString(),
    notice
  });
};

export const downloadRespawnBugReport = async (args: {
  notice: PlayerRespawnNotice;
  state: ClientState;
  wsUrl: string;
}): Promise<void> => {
  const serverOrigin = serverHttpOriginFromWsUrl(args.wsUrl);
  const [clientDebugBundle, debugBundle, incidents] = await Promise.all([
    buildClientDebugBundle({
      state: args.state,
      wsUrl: args.wsUrl
    }),
    withTimeout(`${serverOrigin}/admin/runtime/debug-bundle`),
    withTimeout(`${serverOrigin}/admin/runtime/incidents`)
  ]);
  saveJsonFile(`border-empires-respawn-report-${args.notice.id}-${timestampToken()}.json`, {
    generatedAt: new Date().toISOString(),
    notice: args.notice,
    wsUrl: args.wsUrl,
    serverOrigin,
    clientDebugBundle,
    clientEvents: snapshotClientDebugEvents(300),
    serverDebugBundle: debugBundle,
    serverIncidents: incidents
  });
};
