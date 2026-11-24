// Calls to the hosting service (apps/sector-control), which lists the hosted
// sectors an account belongs to and hands out the ticket needed to enter one.
// Always the main API origin, never a sector's own server.
import type { HostedSectorMapSize, HostedSectorMapStyle } from "@border-empires/shared";

import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";

export type HostedSectorState = "awaiting_payment" | "creating" | "open" | "ended" | "deleted" | "cancelled" | "refunded";

export type HostedSectorSummary = {
  sectorId: string;
  state: HostedSectorState;
  role: "host" | "member";
  options: { mapStyle: HostedSectorMapStyle; mapSize: HostedSectorMapSize };
  members: number;
  humanPlaces: number;
  delayed: boolean;
};

export type HostedSectorTicket = { ticket: string; expiresAt: number; wsUrl: string };

export type HostingApiFailure = { ok: false; code: string; message: string };
export type HostingApiResult<T> = ({ ok: true } & T) | HostingApiFailure;

export type HostingApiDeps = {
  /** The main gateway's WebSocket URL; the API origin is derived from it. */
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
};

const SECTOR_STATES: readonly string[] = ["awaiting_payment", "creating", "open", "ended", "deleted", "cancelled", "refunded"];

const failure = (body: unknown, fallback: string): HostingApiFailure => {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return { ok: false, code: typeof record.code === "string" ? record.code : "UNAVAILABLE", message: typeof record.message === "string" ? record.message : fallback };
};

const parseSector = (value: unknown): HostedSectorSummary | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const options = record.options as Record<string, unknown> | undefined;
  if (typeof record.sectorId !== "string" || typeof record.state !== "string" || !SECTOR_STATES.includes(record.state)) return undefined;
  if (!options || (options.mapStyle !== "continents" && options.mapStyle !== "islands") || (options.mapSize !== "standard" && options.mapSize !== "small")) return undefined;
  if (typeof record.members !== "number" || typeof record.humanPlaces !== "number") return undefined;
  return {
    sectorId: record.sectorId,
    state: record.state as HostedSectorState,
    role: record.role === "host" ? "host" : "member",
    options: { mapStyle: options.mapStyle, mapSize: options.mapSize },
    members: record.members,
    humanPlaces: record.humanPlaces,
    delayed: record.delayed === true
  };
};

export const createHostingApi = (deps: HostingApiDeps) => {
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  const call = async (method: "GET" | "POST", path: string): Promise<{ status: number; body: unknown } | HostingApiFailure> => {
    const token = await deps.getIdToken();
    if (!token) return { ok: false, code: "UNAUTHORIZED", message: "Sign in to continue." };
    try {
      const response = await fetchImpl(`${rallyApiOrigin(deps.wsUrl)}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
      return { status: response.status, body: await response.json().catch(() => undefined) };
    } catch {
      return { ok: false, code: "UNAVAILABLE", message: "Couldn't reach the hosting service. Try again." };
    }
  };

  const okBody = (reply: { status: number; body: unknown }): Record<string, unknown> | undefined => {
    const body = reply.body as Record<string, unknown> | undefined;
    return reply.status === 200 && body && body.ok === true ? body : undefined;
  };

  return {
    async listSectors(): Promise<HostingApiResult<{ sectors: HostedSectorSummary[] }>> {
      const reply = await call("GET", "/hosting/sectors");
      if ("ok" in reply) return reply;
      const body = okBody(reply);
      if (!body || !Array.isArray(body.sectors)) return failure(reply.body, "Couldn't load your sectors.");
      return { ok: true, sectors: body.sectors.map(parseSector).filter((sector): sector is HostedSectorSummary => sector !== undefined) };
    },

    async issueTicket(sectorId: string): Promise<HostingApiResult<HostedSectorTicket>> {
      const reply = await call("POST", `/hosting/sectors/${encodeURIComponent(sectorId)}/ticket`);
      if ("ok" in reply) return reply;
      const body = okBody(reply);
      if (!body || typeof body.ticket !== "string" || typeof body.expiresAt !== "number" || typeof body.wsUrl !== "string") return failure(reply.body, "This sector can't be entered right now.");
      return { ok: true, ticket: body.ticket, expiresAt: body.expiresAt, wsUrl: body.wsUrl };
    },

    async acceptInvite(code: string): Promise<HostingApiResult<{ sector: HostedSectorSummary }>> {
      const reply = await call("POST", `/hosting/invites/${encodeURIComponent(code)}/accept`);
      if ("ok" in reply) return reply;
      const sector = parseSector(okBody(reply)?.sector);
      return sector ? { ok: true, sector } : failure(reply.body, "This invite link is no longer valid.");
    }
  };
};

export type HostingApi = ReturnType<typeof createHostingApi>;
