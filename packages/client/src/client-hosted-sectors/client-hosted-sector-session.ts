// Which server this page is connected to. By default it is the public
// sector. `/?sector=<id>` means a hosted sector: a private Sector Contest on
// its own server, entered with a short-lived membership ticket.
//
// The socket is created synchronously at page load, before sign-in resolves,
// so "Enter" (client-hosted-sectors-panel.ts) fetches the ticket first, puts
// it in sessionStorage with the server address, and then loads the page with
// ?sector=. This module reads that back.
import type { HostedSectorTicket, HostingApi } from "./client-hosted-sectors-api.js";

export type HostedSectorSession = { sectorId: string; wsUrl: string; ticket: string; expiresAt: number };

const STORAGE_KEY = "be-hosted-sector";
const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
/** Hosted sector servers live only under this domain; nothing else is ever connected to. */
const HOSTED_SECTOR_HOST_SUFFIX = ".sectors.borderempires.com";
/** A ticket this close to expiry is replaced before use. */
const TICKET_REFRESH_MARGIN_MS = 60_000;

/** Shown on the season-end screen of a hosted sector in place of the "next contest" count. */
export const HOSTED_SECTOR_ENDED_FINEPRINT = "This hosted sector ran a single Sector Contest. It stays open for a few days to look around.";

/**
 * Hosted sectors are built but not launched: nothing sells or creates them
 * yet. Until the client is built with VITE_HOSTED_SECTORS=1, players see no
 * trace of the feature. Never on in the apps (docs/hosted-sectors-plan.md, Q15).
 */
export const hostedSectorsEnabled = (native: boolean, flag: string | undefined = import.meta.env.VITE_HOSTED_SECTORS as string | undefined): boolean =>
  !native && flag === "1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const hostedSectorIdFromSearch = (search: string): string | undefined => {
  const id = new URLSearchParams(search).get("sector");
  return id && ID_PATTERN.test(id) ? id : undefined;
};

export const hostedInviteCodeFromPath = (pathname: string): string | undefined => {
  const code = /^\/h\/([^/]+)\/?$/.exec(pathname)?.[1];
  return code && ID_PATTERN.test(code) ? code : undefined;
};

/**
 * The address came from our own hosting service, but it decides where the
 * player's sign-in token is sent, so it is checked again here. On a local
 * development page any ws(s) address is allowed, for the fake providers.
 */
export const isAllowedHostedSectorWsUrl = (wsUrl: string, pageIsLocal: boolean): boolean => {
  try {
    const url = new URL(wsUrl);
    if (pageIsLocal) return url.protocol === "ws:" || url.protocol === "wss:";
    return url.protocol === "wss:" && url.hostname.endsWith(HOSTED_SECTOR_HOST_SUFFIX) && url.pathname === "/ws";
  } catch {
    return false;
  }
};

export const stashHostedSectorSession = (session: HostedSectorSession, storage: StorageLike): void => {
  storage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearHostedSectorSession = (storage: StorageLike): void => {
  storage.removeItem(STORAGE_KEY);
};

export const readHostedSectorSession = (sectorId: string, storage: StorageLike, pageIsLocal: boolean): HostedSectorSession | undefined => {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as Partial<HostedSectorSession> | null;
    if (!parsed || parsed.sectorId !== sectorId) return undefined;
    if (typeof parsed.wsUrl !== "string" || typeof parsed.ticket !== "string" || typeof parsed.expiresAt !== "number") return undefined;
    if (!isAllowedHostedSectorWsUrl(parsed.wsUrl, pageIsLocal)) return undefined;
    return { sectorId, wsUrl: parsed.wsUrl, ticket: parsed.ticket, expiresAt: parsed.expiresAt };
  } catch {
    return undefined;
  }
};

// Set once by createClientSocketSetup at page load; the page never switches server without a reload.
let active: HostedSectorSession | undefined;

export const setActiveHostedSectorSession = (session: HostedSectorSession | undefined): void => {
  active = session;
};

export const activeHostedSectorId = (): string | undefined => active?.sectorId;

/**
 * Supplies the ticket for each AUTH. Every connect and reconnect goes through
 * the socket authenticator, and a ticket lasts ten minutes, so a new one is
 * fetched when the held one is close to expiry or the server refused it.
 */
export const createSectorTicketProvider = (deps: {
  session: HostedSectorSession;
  issueTicket: HostingApi["issueTicket"];
  now?: () => number;
  onTicket?: (ticket: HostedSectorTicket) => void;
}): ((forceRefresh: boolean) => Promise<string | undefined>) => {
  const now = deps.now ?? (() => Date.now());
  let held = { ticket: deps.session.ticket, expiresAt: deps.session.expiresAt };
  return async (forceRefresh) => {
    if (!forceRefresh && held.expiresAt - now() > TICKET_REFRESH_MARGIN_MS) return held.ticket;
    const issued = await deps.issueTicket(deps.session.sectorId);
    // No ticket (removed from the sector, or it has closed): AUTH goes without one and the server refuses it.
    if (!issued.ok) return undefined;
    held = { ticket: issued.ticket, expiresAt: issued.expiresAt };
    deps.onTicket?.(issued);
    return held.ticket;
  };
};

/** The provider for the page's own hosted sector, or undefined on the public sector. */
export const createActiveSectorTicketProvider = (deps: { issueTicket: HostingApi["issueTicket"]; storage?: StorageLike }): ((forceRefresh: boolean) => Promise<string | undefined>) | undefined => {
  if (!active) return undefined;
  const session = active;
  return createSectorTicketProvider({
    session,
    issueTicket: deps.issueTicket,
    // Kept in step so a reload within the ticket's life needs no round trip.
    onTicket: (ticket) => { if (deps.storage) stashHostedSectorSession({ sectorId: session.sectorId, wsUrl: session.wsUrl, ticket: ticket.ticket, expiresAt: ticket.expiresAt }, deps.storage); }
  });
};
