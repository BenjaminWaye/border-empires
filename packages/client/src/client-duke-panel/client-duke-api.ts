import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { HTTP_FALLBACK_MESSAGES } from "./client-duke-format.js";
import type { DukeActionFailure, DukeStatus } from "./client-duke-types.js";

export type DukeApiDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
};

export type DukeActionOutcome = { ok: true } | (DukeActionFailure & { message?: string });

export type DukeApi = {
  fetchStatus: () => Promise<{ status?: DukeStatus; notADuke?: boolean; message?: string }>;
  invest: (body: { kind: "FIGHTER" | "PROBE" | "REFIT" } | { kind: "FORTIFY"; seasonId: string; points: number }) => Promise<DukeActionOutcome>;
  cancelBuild: () => Promise<DukeActionOutcome>;
  order: (body: { kind: "PROBE" | "RAID"; seasonId: string }) => Promise<DukeActionOutcome>;
  answerOffer: (accept: boolean) => Promise<DukeActionOutcome>;
  moveAgainstCourt: (influence: number) => Promise<DukeActionOutcome>;
};

type ErrorBody = { ok?: boolean; code?: string; availableAt?: number };

export const createDukeApi = (deps: DukeApiDeps): DukeApi => {
  const origin = rallyApiOrigin(deps.wsUrl);
  const headers = async (): Promise<Record<string, string> | undefined> => {
    const token = await deps.getIdToken();
    return token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : undefined;
  };

  const post = async (path: string, body?: object): Promise<DukeActionOutcome> => {
    const auth = await headers();
    if (!auth) return { ok: false, code: "SIGNED_OUT", message: HTTP_FALLBACK_MESSAGES[401] ?? "" };
    try {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {})
      });
      const parsed = (await response.json().catch(() => undefined)) as ErrorBody | undefined;
      if (response.ok && parsed?.ok !== false) return { ok: true };
      if (parsed?.code) return { ok: false, code: parsed.code, ...(parsed.availableAt !== undefined ? { availableAt: parsed.availableAt } : {}) };
      return { ok: false, code: "HTTP_ERROR", message: HTTP_FALLBACK_MESSAGES[response.status] ?? "That could not be done right now." };
    } catch {
      return { ok: false, code: "NETWORK", message: "Could not reach the server. Try again." };
    }
  };

  return {
    fetchStatus: async () => {
      const auth = await headers();
      if (!auth) return { message: HTTP_FALLBACK_MESSAGES[401] ?? "" };
      try {
        const response = await fetch(`${origin}/hq/galaxy/duke`, { headers: auth });
        if (response.status === 403) return { notADuke: true };
        if (!response.ok) return { message: HTTP_FALLBACK_MESSAGES[response.status] ?? "Could not load your Duke status." };
        const body = (await response.json().catch(() => undefined)) as { duke?: DukeStatus } | undefined;
        return body?.duke ? { status: body.duke } : { message: "Could not load your Duke status." };
      } catch {
        return { message: "Could not reach the server. Try again." };
      }
    },
    invest: (body) => post("/hq/galaxy/duke/invest", body),
    cancelBuild: () => post("/hq/galaxy/duke/invest/cancel"),
    order: (body) => post("/hq/galaxy/duke/order", body),
    answerOffer: (accept) => post("/hq/galaxy/duke/court-offer", { accept }),
    moveAgainstCourt: (influence) => post("/hq/galaxy/duke/court/move", { influence })
  };
};
