// ServerProvider backed by the Hetzner Cloud API (plan section 5, PR 4).
//
// One server per sector, named and labelled with the sector id, and one DNS
// record <sector id>.<zone> pointing at it. Every step can be repeated: an
// existing server is found by its label before a new one is asked for, and
// the record is set rather than added.
import type { HostedSectorOptions } from "@border-empires/shared";

import type { ServerProvider } from "../providers.js";
import { isConflict, isNotFound, type HetznerApi } from "./hetzner-api.js";
import { sectorAdminToken } from "./sector-admin-token.js";
import { sectorCloudInit } from "./sector-cloud-init.js";

export type HetznerServerProviderConfig = {
  /** The DNS zone sectors live under, delegated to Hetzner DNS: borderempires-sectors.com */
  dnsZone: string;
  serverType: string;
  location: string;
  image: string;
  /** Optional Hetzner Cloud Firewall (80, 443) attached to every sector server. */
  firewallId?: number;
  githubRepo: string;
  sectorAdminSecret: string;
  ticketPublicKey: string;
  /** The release production runs; a new sector starts on it. */
  releaseSha: () => Promise<string>;
};

export type SectorHttpFetch = (url: string, init: { headers?: Record<string, string> }) => Promise<{ status: number; json: () => Promise<unknown> }>;

const LABEL = "be-sector";
const DNS_TTL_SECONDS = 300;
const SECTOR_ID = /^s-[a-z0-9-]{1,61}$/;

type HetznerServer = { id: number; name: string; public_net?: { ipv4?: { ip?: string } } };

export const createHetznerServerProvider = (api: HetznerApi, config: HetznerServerProviderConfig, deps: { fetchImpl?: SectorHttpFetch } = {}): ServerProvider => {
  const fetchImpl: SectorHttpFetch = deps.fetchImpl ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }));
  const zone = encodeURIComponent(config.dnsZone);
  const hostnameOf = (sectorId: string): string => `${sectorId}.${config.dnsZone}`;
  const sectorIdOf = (hostname: string): string => {
    const sectorId = hostname.endsWith(`.${config.dnsZone}`) ? hostname.slice(0, -(config.dnsZone.length + 1)) : "";
    if (!SECTOR_ID.test(sectorId)) throw new Error(`${hostname} is not a sector host`);
    return sectorId;
  };

  const findServer = async (sectorId: string): Promise<HetznerServer | undefined> => {
    const listed = await api.request("GET", `/servers?label_selector=${encodeURIComponent(`${LABEL}==${sectorId}`)}`);
    return (listed.servers as HetznerServer[] | undefined)?.[0];
  };

  const createNew = async (sectorId: string, options: HostedSectorOptions): Promise<HetznerServer> => {
    const userData = sectorCloudInit({
      sectorId, hostname: hostnameOf(sectorId), options, releaseSha: await config.releaseSha(),
      adminToken: sectorAdminToken(config.sectorAdminSecret, sectorId), ticketPublicKey: config.ticketPublicKey, githubRepo: config.githubRepo
    });
    try {
      const created = await api.request("POST", "/servers", {
        name: sectorId,
        server_type: config.serverType,
        location: config.location,
        image: config.image,
        labels: { [LABEL]: sectorId, "be-hosted": "1" },
        user_data: userData,
        public_net: { enable_ipv4: true, enable_ipv6: true },
        ...(config.firewallId !== undefined ? { firewalls: [{ firewall: config.firewallId }] } : {})
      });
      return created.server as HetznerServer;
    } catch (error) {
      // Server names are unique in a project: a second request finds the first server.
      if (!isConflict(error)) throw error;
      const existing = await findServer(sectorId);
      if (!existing) throw error;
      return existing;
    }
  };

  const setDnsRecord = async (sectorId: string, ip: string): Promise<void> => {
    const records = [{ value: ip }];
    try {
      await api.request("POST", `/zones/${zone}/rrsets`, { name: sectorId, type: "A", ttl: DNS_TTL_SECONDS, records });
    } catch (error) {
      if (!isConflict(error)) throw error;
      await api.request("POST", `/zones/${zone}/rrsets/${encodeURIComponent(sectorId)}/A/actions/set_records`, { records });
    }
  };

  const sectorJson = async (url: string, headers?: Record<string, string>): Promise<Record<string, unknown>> => {
    const response = await fetchImpl(url, headers ? { headers } : {});
    if (response.status !== 200) throw new Error(`${url} answered ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };

  return {
    async createServer({ sectorId, options }) {
      if (!SECTOR_ID.test(sectorId)) throw new Error(`bad sector id ${sectorId}`);
      const server = (await findServer(sectorId)) ?? (await createNew(sectorId, options));
      const ip = server.public_net?.ipv4?.ip;
      if (!ip) throw new Error(`server for ${sectorId} has no IPv4 address yet`);
      await setDnsRecord(sectorId, ip);
      return { serverRef: String(server.id), hostname: hostnameOf(sectorId) };
    },

    async isHealthy(hostname) {
      try {
        return (await sectorJson(`https://${hostname}/health`)).ok === true;
      } catch {
        // Not answering yet is normal while the server boots and the world is generated.
        return false;
      }
    },

    async getContestStatus(hostname) {
      const sectorId = sectorIdOf(hostname);
      const summary = await sectorJson(`https://${hostname}/hq/summary`);
      const status = await sectorJson(`https://${hostname}/admin/hosted/status`, { authorization: `Bearer ${sectorAdminToken(config.sectorAdminSecret, sectorId)}` });
      const lastHumanVisitAt = typeof status.lastHumanVisitAt === "number" ? status.lastHumanVisitAt : undefined;
      return { ended: summary.status === "ended", ...(lastHumanVisitAt !== undefined ? { lastHumanVisitAt } : {}) };
    },

    async deleteServer(serverRef) {
      if (!/^\d+$/.test(serverRef)) throw new Error(`bad server reference ${serverRef}`);
      let name: string | undefined;
      try {
        name = ((await api.request("GET", `/servers/${serverRef}`)).server as HetznerServer | undefined)?.name;
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
      if (name && SECTOR_ID.test(name)) {
        try {
          await api.request("DELETE", `/zones/${zone}/rrsets/${encodeURIComponent(name)}/A`);
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
      }
      try {
        await api.request("DELETE", `/servers/${serverRef}`);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
  };
};
