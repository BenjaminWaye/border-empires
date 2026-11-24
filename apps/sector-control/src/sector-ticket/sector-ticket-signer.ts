// Signs the membership ticket a game server in hosted mode asks for at login
// (apps/realtime-gateway/src/hosted-sector/hosted-sector-ticket.ts checks it).
// Only this service holds the private key; sector servers get the public half.
import { HOSTED_SECTOR_TICKET_ALGORITHM, HOSTED_SECTOR_TICKET_ISSUER, hostedSectorTicketAudience } from "@border-empires/shared";
import { importPKCS8, SignJWT } from "jose";

/** Long enough to connect and reconnect through a short outage, short enough that removing a member takes effect soon. */
export const SECTOR_TICKET_TTL_SECONDS = 600;

export type SectorTicketSigner = (input: { sectorId: string; accountUid: string }) => Promise<{ ticket: string; expiresAt: number }>;

export const createSectorTicketSigner = (config: { privateKeyPem: string; now?: () => number; ttlSeconds?: number }): SectorTicketSigner => {
  const key = importPKCS8(config.privateKeyPem, HOSTED_SECTOR_TICKET_ALGORITHM);
  key.catch(() => undefined);
  const now = config.now ?? (() => Date.now());
  const ttlSeconds = config.ttlSeconds ?? SECTOR_TICKET_TTL_SECONDS;
  return async ({ sectorId, accountUid }) => {
    const issuedAt = Math.floor(now() / 1000);
    const expiresAtSeconds = issuedAt + ttlSeconds;
    const ticket = await new SignJWT({})
      .setProtectedHeader({ alg: HOSTED_SECTOR_TICKET_ALGORITHM })
      .setIssuer(HOSTED_SECTOR_TICKET_ISSUER)
      .setAudience(hostedSectorTicketAudience(sectorId))
      .setSubject(accountUid)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAtSeconds)
      .sign(await key);
    return { ticket, expiresAt: expiresAtSeconds * 1000 };
  };
};
