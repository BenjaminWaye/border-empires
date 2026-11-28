// Contract shared by the hosting service (which signs membership tickets and
// creates sector servers), the game server (which checks tickets) and the
// client (which shows the options). See docs/hosted-sectors-plan.md.

export const HOSTED_SECTOR_TICKET_ISSUER = "border-empires-hosting";
export const HOSTED_SECTOR_TICKET_ALGORITHM = "EdDSA";

/** Audience a ticket must carry to be accepted by the sector `sectorId`. */
export const hostedSectorTicketAudience = (sectorId: string): string => `sector:${sectorId}`;

export const HOSTED_SECTOR_MAP_STYLES = ["continents", "islands"] as const;
export type HostedSectorMapStyle = (typeof HOSTED_SECTOR_MAP_STYLES)[number];

/**
 * Sizes a host can choose (owner decision 2026-11-23). Nothing larger than
 * standard is offered until its memory has been measured.
 */
export const HOSTED_SECTOR_MAP_SIZES = {
  standard: { worldWidth: 640, worldHeight: 320, aiHouses: 60, humanPlaces: 40 },
  small: { worldWidth: 320, worldHeight: 160, aiHouses: 20, humanPlaces: 12 }
} as const;
export type HostedSectorMapSize = keyof typeof HOSTED_SECTOR_MAP_SIZES;

export type HostedSectorOptions = { mapStyle: HostedSectorMapStyle; mapSize: HostedSectorMapSize };

export const isHostedSectorMapStyle = (value: unknown): value is HostedSectorMapStyle =>
  typeof value === "string" && (HOSTED_SECTOR_MAP_STYLES as readonly string[]).includes(value);

export const isHostedSectorMapSize = (value: unknown): value is HostedSectorMapSize =>
  typeof value === "string" && Object.hasOwn(HOSTED_SECTOR_MAP_SIZES, value);

/**
 * The DNS zone every hosted sector server lives under, as <sector id>.<zone>.
 * The web client connects only to hosts under it and the hosting service
 * creates records only in it, so both read it from here.
 */
export const HOSTED_SECTOR_DNS_ZONE = "borderempires-sectors.com";

/** Launch price of one hosted sector, in US cents (owner decision 2026-11-23). */
export const HOSTED_SECTOR_PRICE_USD_CENTS = 2000;

/**
 * The Terms of Sale version the order form shows. Stored with every consent,
 * so the order can be matched with the wording the buyer agreed to. Bump it
 * whenever docs/legal-drafts/purchase-terms.html (or its published copy) changes,
 * together with that file's terms-version meta tag (order confirmations attach
 * the file only when the two match).
 */
export const HOSTED_SECTOR_TERMS_VERSION = "2026-11-25-draft";

/**
 * The two statements a buyer ticks, separately and unticked by default,
 * before paying (docs/legal-drafts/README.md, "What the code and settings
 * must do before sales open", items 2 and 3). Shown and stored word for word.
 */
export const HOSTED_SECTOR_CONSENT_TERMS = "I accept the Terms of Sale.";
export const HOSTED_SECTOR_CONSENT_EARLY_START =
  "I ask for my sector to start now, during the 14-day withdrawal period. I understand that if I withdraw I pay for the days it has been open, and that I lose the right to withdraw once its Sector Contest has ended.";

/** FNV-1a (32-bit), hex. Small and the same in the browser and on the server; not for secrecy. */
const fingerprint = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

/**
 * A fingerprint of the two statements as this build shows them. The client
 * sends it with the consent and the hosting service accepts only its own, so
 * the wording stored as proof is always the wording the buyer saw, even if
 * one is changed without bumping the terms version.
 */
export const HOSTED_SECTOR_CONSENT_WORDING = fingerprint(`${HOSTED_SECTOR_CONSENT_TERMS}\n${HOSTED_SECTOR_CONSENT_EARLY_START}`);

/** What the client sends with an order or a share: both boxes ticked, against this version of the terms and this wording. */
export type HostedSectorConsent = { termsVersion: string; wording: string; acceptedTerms: true; requestedEarlyStart: true };

/**
 * "ok": both ticked, current terms and wording. "outdated": both ticked, but
 * on a page loaded before the terms or wording changed. "missing": anything else.
 */
export const checkHostedSectorConsent = (value: unknown): "ok" | "outdated" | "missing" => {
  if (typeof value !== "object" || value === null) return "missing";
  const consent = value as Record<string, unknown>;
  if (consent.acceptedTerms !== true || consent.requestedEarlyStart !== true) return "missing";
  return consent.termsVersion === HOSTED_SECTOR_TERMS_VERSION && consent.wording === HOSTED_SECTOR_CONSENT_WORDING ? "ok" : "outdated";
};

export const isHostedSectorConsent = (value: unknown): value is HostedSectorConsent => checkHostedSectorConsent(value) === "ok";

/** How long a hosted sector runs, shown before paying for it or for a share of it. */
const HOSTED_SECTOR_DURATION_FACTS =
  "A hosted sector has no fixed end: it stays open for 3 days after its Sector Contest ends, and closes after 7 days in which no member visits.";

/** Shown directly before paying (Art. 8(2) of Directive 2011/83/EU): that it is paid once, with tax, and how long the sector runs. */
export const HOSTED_SECTOR_PRICE_FACTS = `One single payment, tax included; no subscription. ${HOSTED_SECTOR_DURATION_FACTS}`;

/** The same for one share of a funding bar: each share is a purchase of its own. */
export const HOSTED_SECTOR_SHARE_PRICE_FACTS = `Your share is one single payment of the amount you choose, tax included; no subscription. ${HOSTED_SECTOR_DURATION_FACTS}`;
