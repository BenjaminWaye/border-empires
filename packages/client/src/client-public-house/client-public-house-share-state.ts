// What your own profile's sharing buttons show: whether this account has a live
// public link (GET /hq/public-profile/link), whether a share or stop is in
// flight, and a short note on how the last one went. The profile is re-rendered
// from HTML every HUD tick, so all of it lives here rather than in the DOM.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";

export type PublicProfileShareDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  /** Who is signed in; the cached sharing state belongs to one account. */
  accountKey?: () => string | undefined;
  fetchImpl?: typeof fetch;
};

/** Whether this account has a live public link; "unknown" until the gateway answers. */
export type PublicProfileShareState = "unknown" | "on" | "off";

export type PublicProfileShareView = {
  state: PublicProfileShareState;
  pending?: "share" | "stop";
  /** How the last share or stop went ("Link copied", "Sharing stopped", a failure). */
  note?: string;
  /** The public page this page made or shared, shown while sharing is on so the player always sees it. */
  link?: string;
};

// A link made or removed on another device shows up within this long.
const SHARE_STATE_REFRESH_MS = 60_000;
const SHARE_STATE_RETRY_MS = 30_000;
const NOTE_MS = 4_000;

const known = new Map<string, { state: "on" | "off"; at: number }>();
const links = new Map<string, string>();
const failedAt = new Map<string, number>();
const inFlight = new Set<string>();
// Bumped by every share or stop, so a status check that started before one cannot overwrite its result.
let generation = 0;
let pending: PublicProfileShareView["pending"];
let note: { text: string; at: number } | undefined;

export const shareAccountOf = (deps: PublicProfileShareDeps): string => deps.accountKey?.() ?? "";

export const rememberPublicProfileShareState = (deps: PublicProfileShareDeps, state: "on" | "off", nowMs = Date.now()): void => {
  generation += 1;
  known.set(shareAccountOf(deps), { state, at: nowMs });
};

/** The link the last share made for this account (cleared by Stop sharing). */
export const rememberPublicProfileLink = (deps: PublicProfileShareDeps, url: string | undefined): void => {
  if (url) links.set(shareAccountOf(deps), url);
  else links.delete(shareAccountOf(deps));
};

export const setPublicProfileSharePending = (value: PublicProfileShareView["pending"]): void => {
  pending = value;
};

export const showPublicProfileShareNote = (text: string | undefined, nowMs = Date.now()): void => {
  note = text ? { text, at: nowMs } : undefined;
};

export const publicProfileSharePending = (): PublicProfileShareView["pending"] => pending;

/** GET /hq/public-profile/link. "no_token" is not a gateway failure: sign-in may simply not have finished. */
export const requestPublicProfileShareState = async (deps: PublicProfileShareDeps): Promise<"on" | "off" | "error" | "no_token"> => {
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  try {
    const token = await deps.getIdToken();
    if (!token) return "no_token";
    const response = await fetchImpl(`${rallyApiOrigin(deps.wsUrl)}/hq/public-profile/link`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    const body = (await response.json().catch(() => undefined)) as { ok?: unknown; publicId?: unknown } | undefined;
    if (body?.ok !== true) return "error";
    return typeof body.publicId === "string" ? "on" : "off";
  } catch {
    return "error";
  }
};

/** Read on every profile render: answers from cache, and asks the gateway (one request per account at a time) when the answer is missing or old. */
export const publicProfileShareView = (deps: PublicProfileShareDeps | undefined, nowMs = Date.now()): PublicProfileShareView => {
  const shown = note && nowMs - note.at < NOTE_MS ? note.text : undefined;
  const extras = { ...(pending ? { pending } : {}), ...(shown ? { note: shown } : {}) };
  if (!deps) return { state: "unknown", ...extras };
  const account = shareAccountOf(deps);
  const entry = known.get(account);
  const stale = !entry || nowMs - entry.at >= SHARE_STATE_REFRESH_MS;
  if (stale && !inFlight.has(account) && nowMs - (failedAt.get(account) ?? -Infinity) >= SHARE_STATE_RETRY_MS) {
    inFlight.add(account);
    const startedAt = generation;
    void requestPublicProfileShareState(deps)
      .then((result) => {
        if (result === "error") failedAt.set(account, Date.now());
        else if ((result === "on" || result === "off") && generation === startedAt) known.set(account, { state: result, at: Date.now() });
      })
      .finally(() => inFlight.delete(account));
  }
  const state = entry?.state ?? "unknown";
  const link = state === "on" ? links.get(account) : undefined;
  return { state, ...extras, ...(link ? { link } : {}) };
};

/** Tests only. */
export const resetPublicProfileShareState = (): void => {
  known.clear();
  links.clear();
  failedAt.clear();
  inFlight.clear();
  generation = 0;
  pending = undefined;
  note = undefined;
};
