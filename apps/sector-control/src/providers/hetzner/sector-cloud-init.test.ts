import { describe, expect, it } from "vitest";

import { sectorAdminToken } from "./sector-admin-token.js";
import { sectorCloudInit, sectorEnvFile } from "./sector-cloud-init.js";

const INPUT = {
  sectorId: "s-abc", hostname: "s-abc.borderempires-sectors.com", options: { mapStyle: "islands", mapSize: "small" },
  releaseSha: "b".repeat(40), adminToken: "tok_123", ticketPublicKey: "MCowBQYDK2VwAyEA+abc=", githubRepo: "BenjaminWaye/border-empires"
} as const;

describe("sector cloud-init", () => {
  it("writes the sector's settings, overriding the shared hosted env for the chosen size and style", () => {
    expect(sectorEnvFile(INPUT)).toBe([
      "HOSTED_SECTOR_ID=s-abc", "HOSTED_SECTOR_TICKET_PUBLIC_KEY=MCowBQYDK2VwAyEA+abc=", "ADMIN_API_TOKEN=tok_123",
      "SIMULATION_MAP_STYLE=islands", "WORLD_WIDTH=320", "WORLD_HEIGHT=160", "SIMULATION_AI_PLAYER_COUNT=20",
      "SIMULATION_MAX_SEASON_PLAYERS=12", "SIMULATION_MAX_SEASON_GUESTS=0", ""
    ].join("\n"));
  });

  it("bootstraps as a hosted sector and deploys the release production runs", () => {
    const userData = sectorCloudInit(INPUT);
    expect(userData.startsWith("#cloud-config\n")).toBe(true);
    expect(userData).toContain(`https://raw.githubusercontent.com/BenjaminWaye/border-empires/${"b".repeat(40)}/deploy/bin/bootstrap-server.sh`);
    expect(userData).toContain("BE_ENV=hosted BE_HOSTNAME=s-abc.borderempires-sectors.com");
    expect(userData).toContain(`runuser -u deploy -- env HOME=/home/deploy /opt/border-empires/bin/deploy ${"b".repeat(40)}`);
    // Hetzner expires root's password on a server made without an SSH key, and sudo
    // then refuses through PAM (third test sector, 2026-11-27).
    expect(userData).not.toMatch(/\bsudo\b/);
    // The settings file is moved into place and removed, so it is not left readable by root alone.
    expect(userData).toContain("rm -f /root/be-sector.env");
  });

  it("refuses inputs that could change what the script does", () => {
    expect(() => sectorCloudInit({ ...INPUT, releaseSha: "main" })).toThrow(/full git sha/);
    expect(() => sectorCloudInit({ ...INPUT, hostname: "x; rm -rf /" })).toThrow(/host name/);
    expect(() => sectorCloudInit({ ...INPUT, githubRepo: "a/b c" })).toThrow(/owner\/name/);
    expect(() => sectorEnvFile({ ...INPUT, adminToken: "a\nB=1" })).toThrow(/unsafe value/);
  });
});

describe("sector admin token", () => {
  it("differs per sector and per secret, and is stable", () => {
    expect(sectorAdminToken("s1", "s-abc")).toBe(sectorAdminToken("s1", "s-abc"));
    expect(sectorAdminToken("s1", "s-abc")).not.toBe(sectorAdminToken("s1", "s-abd"));
    expect(sectorAdminToken("s1", "s-abc")).not.toBe(sectorAdminToken("s2", "s-abc"));
    expect(sectorAdminToken("s1", "s-abc")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
