// Waitlist for the next Sector Contest, offered on the SEASON_FULL screen.
// The full screen is reached during socket auth, before any session exists,
// so this talks to the gateway's /sector/waitlist HTTP routes with the
// Firebase ID token (same origin resolution as the rally-link API).
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";

export type SectorWaitlistStatus = { waitingCount: number; joined: boolean };

type WaitlistState = {
  authEmail: string;
  seasonFull: boolean;
  seasonFullNotifyAcknowledged: boolean;
  sectorWaitlistCount: number;
  sectorWaitlistJoinFailed: boolean;
};

export type SectorWaitlistDeps = {
  state: WaitlistState;
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  sync: () => void;
  fetchImpl?: typeof fetch;
};

const parseStatus = (body: unknown): SectorWaitlistStatus | undefined => {
  if (!body || typeof body !== "object") return undefined;
  const { ok, waitingCount, joined } = body as Record<string, unknown>;
  if (ok !== true || typeof waitingCount !== "number" || typeof joined !== "boolean") return undefined;
  return { waitingCount, joined };
};

const housesWaiting = (count: number): string => `${count} ${count === 1 ? "House" : "Houses"} waiting`;

export const sectorWaitlistButtonLabel = (state: WaitlistState): string => {
  const count = state.sectorWaitlistCount;
  // No email promise here: the next Sector is announced by the season-start
  // email, which needs a bound address and the seasonStart preference on.
  if (state.seasonFullNotifyAcknowledged) return `On the waitlist for the next Sector${count > 0 ? ` · ${housesWaiting(count)}` : ""}`;
  if (state.sectorWaitlistJoinFailed) return "Couldn't join the waitlist. Tap to try again";
  return `Join the waitlist for the next Sector${count > 0 ? ` (${housesWaiting(count)})` : ""}`;
};

export const createSectorWaitlistController = (deps: SectorWaitlistDeps) => {
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  let refreshStarted = false;
  let joining = false;

  const request = async (method: "GET" | "POST"): Promise<SectorWaitlistStatus | undefined> => {
    const token = await deps.getIdToken();
    if (method === "POST" && !token) return undefined;
    const response = await fetchImpl(`${rallyApiOrigin(deps.wsUrl)}/sector/waitlist`, {
      method,
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {})
    });
    return parseStatus(await response.json().catch(() => undefined));
  };

  const apply = (status: SectorWaitlistStatus | undefined): void => {
    if (!status) return;
    deps.state.sectorWaitlistCount = status.waitingCount;
    deps.state.seasonFullNotifyAcknowledged = status.joined;
    deps.sync();
  };

  return {
    /** Loads the queue size once per page after the season-full screen first shows. */
    refreshIfNeeded(): void {
      if (!deps.state.seasonFull || refreshStarted) return;
      refreshStarted = true;
      void request("GET").then(apply, () => undefined);
    },
    async join(): Promise<boolean> {
      if (joining || deps.state.seasonFullNotifyAcknowledged) return deps.state.seasonFullNotifyAcknowledged;
      joining = true;
      let joined = false;
      try {
        const status = await request("POST");
        apply(status);
        joined = status?.joined === true;
      } catch {
        joined = false;
      } finally {
        joining = false;
      }
      // Refusals (503 while the simulation is down, 409 at rollover, a
      // missing token) must not look like a dead button.
      deps.state.sectorWaitlistJoinFailed = !joined;
      deps.sync();
      return joined;
    }
  };
};
