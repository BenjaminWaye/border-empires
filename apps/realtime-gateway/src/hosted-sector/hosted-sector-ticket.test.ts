import { HOSTED_SECTOR_TICKET_ISSUER, hostedSectorTicketAudience } from "@border-empires/shared";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { createHostedSectorTicketVerifier, parseHostedSectorConfig } from "./hosted-sector-ticket.js";

const NOW = 1_800_000_000_000;

const makeKeys = async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const pem = await exportSPKI(publicKey);
  const ticketPublicKey = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  return { privateKey, ticketPublicKey };
};

type Keys = Awaited<ReturnType<typeof makeKeys>>;

const sign = (
  keys: Keys,
  claims: { sectorId?: string; uid?: string; issuer?: string; expiresInSeconds?: number | null } = {}
): Promise<string> => {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA" })
    .setIssuer(claims.issuer ?? HOSTED_SECTOR_TICKET_ISSUER)
    .setAudience(hostedSectorTicketAudience(claims.sectorId ?? "s-abc"))
    .setSubject(claims.uid ?? "uid-1")
    .setIssuedAt(Math.floor(NOW / 1000));
  if (claims.expiresInSeconds !== null) jwt.setExpirationTime(Math.floor(NOW / 1000) + (claims.expiresInSeconds ?? 600));
  return jwt.sign(keys.privateKey);
};

const verifierFor = (keys: Keys, now = NOW) =>
  createHostedSectorTicketVerifier({ sectorId: "s-abc", ticketPublicKey: keys.ticketPublicKey }, { now: () => now });

describe("hosted sector ticket", () => {
  it("admits the account the ticket was issued to", async () => {
    const keys = await makeKeys();
    expect(await verifierFor(keys)(await sign(keys), "uid-1")).toEqual({ ok: true });
  });

  it("refuses a connection with no ticket", async () => {
    const keys = await makeKeys();
    expect(await verifierFor(keys)(undefined, "uid-1")).toEqual({ ok: false, reason: "missing_ticket" });
  });

  it("refuses a login that has no account id, such as a dev token", async () => {
    const keys = await makeKeys();
    expect(await verifierFor(keys)(await sign(keys), undefined)).toEqual({ ok: false, reason: "missing_account" });
  });

  it("refuses a ticket issued to another account", async () => {
    const keys = await makeKeys();
    expect(await verifierFor(keys)(await sign(keys, { uid: "uid-2" }), "uid-1")).toEqual({ ok: false, reason: "invalid_ticket" });
  });

  it("refuses a ticket for another sector", async () => {
    const keys = await makeKeys();
    expect(await verifierFor(keys)(await sign(keys, { sectorId: "s-other" }), "uid-1")).toEqual({ ok: false, reason: "invalid_ticket" });
  });

  it("refuses an expired ticket and one that never expires", async () => {
    const keys = await makeKeys();
    expect(await verifierFor(keys, NOW + 601_000)(await sign(keys), "uid-1")).toEqual({ ok: false, reason: "invalid_ticket" });
    expect(await verifierFor(keys)(await sign(keys, { expiresInSeconds: null }), "uid-1")).toEqual({ ok: false, reason: "invalid_ticket" });
  });

  it("refuses a ticket signed by another key or another issuer", async () => {
    const keys = await makeKeys();
    const other = await makeKeys();
    expect(await verifierFor(keys)(await sign(other), "uid-1")).toEqual({ ok: false, reason: "invalid_ticket" });
    expect(await verifierFor(keys)(await sign(keys, { issuer: "someone-else" }), "uid-1")).toEqual({ ok: false, reason: "invalid_ticket" });
  });

  it("refuses every ticket when the configured key is not a key", async () => {
    const keys = await makeKeys();
    const verify = createHostedSectorTicketVerifier({ sectorId: "s-abc", ticketPublicKey: "bm90LWEta2V5" }, { now: () => NOW });
    expect(await verify(await sign(keys), "uid-1")).toEqual({ ok: false, reason: "invalid_ticket" });
  });
});

describe("parseHostedSectorConfig", () => {
  it("is off when no sector id is set", () => {
    expect(parseHostedSectorConfig({})).toBeUndefined();
    expect(parseHostedSectorConfig({ HOSTED_SECTOR_TICKET_PUBLIC_KEY: "abc" })).toBeUndefined();
  });

  it("reads the sector id and key", () => {
    expect(parseHostedSectorConfig({ HOSTED_SECTOR_ID: "s-abc", HOSTED_SECTOR_TICKET_PUBLIC_KEY: " key " })).toEqual({ sectorId: "s-abc", ticketPublicKey: "key" });
  });

  it("refuses to boot a hosted sector without a key, or with a malformed id", () => {
    expect(() => parseHostedSectorConfig({ HOSTED_SECTOR_ID: "s-abc" })).toThrow(/HOSTED_SECTOR_TICKET_PUBLIC_KEY/);
    expect(() => parseHostedSectorConfig({ HOSTED_SECTOR_ID: "S ABC", HOSTED_SECTOR_TICKET_PUBLIC_KEY: "key" })).toThrow(/HOSTED_SECTOR_ID/);
  });
});
