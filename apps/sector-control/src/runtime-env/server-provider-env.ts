// Which server provider the hosting service uses, and its settings.
// "fake" creates nothing. "hetzner" creates real servers in the Hetzner
// project the token belongs to: a project that must hold hosted sectors only.
import { HOSTED_SECTOR_DNS_ZONE } from "@border-empires/shared";

export type ServerProviderEnv =
  | { kind: "fake" }
  | {
      kind: "hetzner";
      apiToken: string;
      sectorAdminSecret: string;
      dnsZone: string;
      serverType: string;
      location: string;
      image: string;
      firewallId?: number;
      githubRepo: string;
      /** Answers with the git sha production runs; new sectors start on it. */
      releaseUrl: string;
    };

const plain = (name: string, value: string, pattern: RegExp): string => {
  if (!pattern.test(value)) throw new Error(`${name} has an unexpected value`);
  return value;
};

export const parseServerProviderEnv = (env: NodeJS.ProcessEnv): ServerProviderEnv => {
  const kind = (env.HOSTING_SERVER_PROVIDER ?? "fake").toLowerCase();
  if (kind === "fake") return { kind: "fake" };
  if (kind !== "hetzner") throw new Error(`HOSTING_SERVER_PROVIDER=${kind} is not available; use "fake" or "hetzner"`);
  const apiToken = (env.HETZNER_API_TOKEN ?? "").trim();
  if (!apiToken) throw new Error("HETZNER_API_TOKEN is required for HOSTING_SERVER_PROVIDER=hetzner");
  const sectorAdminSecret = (env.HOSTING_SECTOR_ADMIN_SECRET ?? "").trim();
  // Each sector's admin token is derived from this; a short secret would make them guessable.
  if (sectorAdminSecret.length < 32) throw new Error("HOSTING_SECTOR_ADMIN_SECRET must be at least 32 characters");
  const firewall = (env.HOSTING_SECTOR_FIREWALL_ID ?? "").trim();
  if (firewall && !/^\d+$/.test(firewall)) throw new Error("HOSTING_SECTOR_FIREWALL_ID must be a number");
  const releaseUrl = (env.HOSTING_SECTOR_RELEASE_URL ?? "https://api.borderempires.com/__build_sha.txt").trim();
  if (!/^https:\/\/\S+$/.test(releaseUrl)) throw new Error("HOSTING_SECTOR_RELEASE_URL must be an https URL");
  return {
    kind: "hetzner",
    apiToken,
    sectorAdminSecret,
    dnsZone: sectorDnsZone(env.HOSTING_SECTOR_DNS_ZONE),
    serverType: plain("HOSTING_SECTOR_SERVER_TYPE", (env.HOSTING_SECTOR_SERVER_TYPE ?? "cx23").trim(), /^[a-z0-9-]+$/),
    location: plain("HOSTING_SECTOR_LOCATION", (env.HOSTING_SECTOR_LOCATION ?? "nbg1").trim(), /^[a-z0-9-]+$/),
    image: plain("HOSTING_SECTOR_IMAGE", (env.HOSTING_SECTOR_IMAGE ?? "ubuntu-24.04").trim(), /^[a-z0-9.-]+$/),
    ...(firewall ? { firewallId: Number(firewall) } : {}),
    githubRepo: plain("HOSTING_GITHUB_REPO", (env.HOSTING_GITHUB_REPO ?? "BenjaminWaye/border-empires").trim(), /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    releaseUrl
  };
};

// The web client connects only to hosts under the shared zone, so a sector
// created anywhere else could be paid for but never entered.
const sectorDnsZone = (value: string | undefined): string => {
  const zone = (value ?? HOSTED_SECTOR_DNS_ZONE).trim();
  if (zone !== HOSTED_SECTOR_DNS_ZONE) throw new Error(`HOSTING_SECTOR_DNS_ZONE must be ${HOSTED_SECTOR_DNS_ZONE}: the web client connects only to sectors under it`);
  return zone;
};
