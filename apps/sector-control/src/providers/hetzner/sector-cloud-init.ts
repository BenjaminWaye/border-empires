// The cloud-init user data that turns a fresh Ubuntu server into a sector
// server (docs/hosted-sectors-plan.md, section 5): fetch the deploy scripts at
// the release production runs, bootstrap with BE_ENV=hosted, write this
// sector's settings, and deploy that release.
//
// Cloud-init user data is readable from inside the server only. Every secret
// in it is this sector's own (its admin token) or public (the ticket key).
import { HOSTED_SECTOR_MAP_SIZES, type HostedSectorOptions } from "@border-empires/shared";

export type SectorCloudInitInput = {
  sectorId: string;
  hostname: string;
  options: HostedSectorOptions;
  /** Git sha of the release production runs; the image and the deploy scripts are taken at it. */
  releaseSha: string;
  adminToken: string;
  /** Base64 of the SPKI DER of the ticket key (what HOSTED_SECTOR_TICKET_PUBLIC_KEY expects). */
  ticketPublicKey: string;
  githubRepo: string;
};

const DEPLOY_FILES = ["bin/bootstrap-server.sh", "bin/deploy", "systemd/border-empires-backup.service", "systemd/border-empires-backup.timer"] as const;

const SAFE_VALUE = /^[A-Za-z0-9._:/+=-]+$/;

/** The sector's own settings, loaded after deploy/env/hosted.env, so they override it. */
export const sectorEnvFile = (input: SectorCloudInitInput): string => {
  const size = HOSTED_SECTOR_MAP_SIZES[input.options.mapSize];
  const values: Record<string, string> = {
    HOSTED_SECTOR_ID: input.sectorId,
    HOSTED_SECTOR_TICKET_PUBLIC_KEY: input.ticketPublicKey,
    ADMIN_API_TOKEN: input.adminToken,
    SIMULATION_MAP_STYLE: input.options.mapStyle,
    WORLD_WIDTH: String(size.worldWidth),
    WORLD_HEIGHT: String(size.worldHeight),
    SIMULATION_AI_PLAYER_COUNT: String(size.aiHouses),
    SIMULATION_MAX_SEASON_PLAYERS: String(size.humanPlaces),
    // Members only: no guest seats (owner decision Q8).
    SIMULATION_MAX_SEASON_GUESTS: "0"
  };
  for (const [key, value] of Object.entries(values)) {
    // Nothing here comes from a player, but a value that could break the file is refused anyway.
    if (!SAFE_VALUE.test(value)) throw new Error(`unsafe value for ${key}`);
  }
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
};

export const sectorCloudInit = (input: SectorCloudInitInput): string => {
  if (!/^[0-9a-f]{40}$/.test(input.releaseSha)) throw new Error("releaseSha must be a full git sha");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.githubRepo)) throw new Error("githubRepo must be owner/name");
  if (!/^[a-z0-9.-]+$/.test(input.hostname)) throw new Error("hostname is not a plain host name");
  const base = `https://raw.githubusercontent.com/${input.githubRepo}/${input.releaseSha}/deploy`;
  const indent = (text: string): string => text.trimEnd().split("\n").map((line) => `      ${line}`).join("\n");
  const script = [
    "set -euo pipefail",
    "mkdir -p /root/deploy/bin /root/deploy/systemd",
    ...DEPLOY_FILES.map((file) => `curl -fsSL --retry 5 -o /root/deploy/${file} ${base}/${file}`),
    `BE_ENV=hosted BE_HOSTNAME=${input.hostname} GITHUB_REPO=${input.githubRepo} bash /root/deploy/bin/bootstrap-server.sh`,
    "install -m 600 -o deploy -g deploy /root/be-sector.env /etc/border-empires/secrets.env",
    "rm -f /root/be-sector.env",
    `sudo -u deploy /opt/border-empires/bin/deploy ${input.releaseSha}`
  ].join("\n");
  return [
    "#cloud-config",
    "write_files:",
    "  - path: /root/be-sector.env",
    "    permissions: '0600'",
    "    content: |",
    indent(sectorEnvFile(input)),
    "  - path: /root/be-sector-setup.sh",
    "    permissions: '0700'",
    "    content: |",
    indent(script),
    "runcmd:",
    "  - [bash, /root/be-sector-setup.sh]",
    ""
  ].join("\n");
};
