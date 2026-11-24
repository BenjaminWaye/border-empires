// A hosted sector is a private Sector Contest: only accounts the hosting
// service has admitted may connect (docs/hosted-sectors-plan.md, section 7).
//
// The hosting service signs a short-lived ticket naming the sector and the
// account. This server holds only the public key, keeps no member list and
// never calls the hosting service on the login path, so a restart of that
// service cannot lock players out.
import { importSPKI, jwtVerify } from "jose";

export const HOSTED_SECTOR_TICKET_ISSUER = "border-empires-hosting";
export const HOSTED_SECTOR_TICKET_ALGORITHM = "EdDSA";

/** Audience a ticket must carry to be accepted by the sector `sectorId`. */
export const hostedSectorTicketAudience = (sectorId: string): string => `sector:${sectorId}`;

export type HostedSectorConfig = {
  sectorId: string;
  /** Ed25519 public key: base64 of the SPKI DER (a PEM body on one line). */
  ticketPublicKey: string;
};

export type HostedSectorTicketRejectReason = "missing_ticket" | "missing_account" | "invalid_ticket";

export type HostedSectorTicketVerifier = (
  ticket: string | undefined,
  authUid: string | undefined
) => Promise<{ ok: true } | { ok: false; reason: HostedSectorTicketRejectReason }>;

const pemFromBase64 = (base64: string): string =>
  `-----BEGIN PUBLIC KEY-----\n${base64.replace(/\s+/g, "")}\n-----END PUBLIC KEY-----`;

/**
 * The hosting service issues tickets for ten minutes. Anything that claims a
 * longer life than this is refused, so a mistake there cannot hand out
 * permanent access. Tickets must say when they were issued.
 */
export const HOSTED_SECTOR_TICKET_MAX_AGE_SECONDS = 900;
/** Allowance for the two machines' clocks disagreeing. */
const CLOCK_TOLERANCE_SECONDS = 30;

/**
 * Call at boot. A key that cannot be read would otherwise start a server that
 * looks healthy and turns every paying member away.
 */
export const assertHostedSectorTicketKey = async (config: HostedSectorConfig | undefined): Promise<void> => {
  if (!config) return;
  try {
    await importSPKI(pemFromBase64(config.ticketPublicKey), HOSTED_SECTOR_TICKET_ALGORITHM);
  } catch {
    throw new Error("HOSTED_SECTOR_TICKET_PUBLIC_KEY is not a readable Ed25519 public key (base64 of the SPKI DER, without PEM header lines)");
  }
};

export const createHostedSectorTicketVerifier = (
  config: HostedSectorConfig,
  options: { now?: () => number } = {}
): HostedSectorTicketVerifier => {
  // Imported once. A malformed key rejects every ticket rather than letting
  // anyone in; the entrypoints call assertHostedSectorTicketKey so that such
  // a server never starts.
  const key = importSPKI(pemFromBase64(config.ticketPublicKey), HOSTED_SECTOR_TICKET_ALGORITHM);
  key.catch(() => undefined);
  const audience = hostedSectorTicketAudience(config.sectorId);
  return async (ticket, authUid) => {
    if (!authUid) return { ok: false, reason: "missing_account" };
    if (!ticket) return { ok: false, reason: "missing_ticket" };
    try {
      await jwtVerify(ticket, await key, {
        algorithms: [HOSTED_SECTOR_TICKET_ALGORITHM],
        issuer: HOSTED_SECTOR_TICKET_ISSUER,
        audience,
        subject: authUid,
        requiredClaims: ["exp", "iat"],
        maxTokenAge: HOSTED_SECTOR_TICKET_MAX_AGE_SECONDS,
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        ...(options.now ? { currentDate: new Date(options.now()) } : {})
      });
      return { ok: true };
    } catch {
      return { ok: false, reason: "invalid_ticket" };
    }
  };
};

/**
 * Reads the hosted-sector settings. Unset HOSTED_SECTOR_ID means an ordinary
 * (public) server. A sector id without a key is a boot error: failing open
 * would turn a paid private sector into a public one.
 */
export const parseHostedSectorConfig = (env: NodeJS.ProcessEnv): HostedSectorConfig | undefined => {
  const sectorId = (env.HOSTED_SECTOR_ID ?? "").trim();
  if (!sectorId) return undefined;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(sectorId)) throw new Error("HOSTED_SECTOR_ID must be lowercase letters, digits and hyphens");
  const ticketPublicKey = (env.HOSTED_SECTOR_TICKET_PUBLIC_KEY ?? "").trim();
  if (!ticketPublicKey) throw new Error("HOSTED_SECTOR_ID is set but HOSTED_SECTOR_TICKET_PUBLIC_KEY is missing");
  return { sectorId, ticketPublicKey };
};
