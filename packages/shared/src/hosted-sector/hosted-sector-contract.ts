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
 * whenever docs/legal-drafts/purchase-terms.html (or its published copy) changes.
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

/** What the client sends with an order or a share: both boxes ticked, against this version of the terms. */
export type HostedSectorConsent = { termsVersion: string; acceptedTerms: true; requestedEarlyStart: true };

export const isHostedSectorConsent = (value: unknown): value is HostedSectorConsent => {
  if (typeof value !== "object" || value === null) return false;
  const consent = value as Record<string, unknown>;
  return consent.termsVersion === HOSTED_SECTOR_TERMS_VERSION && consent.acceptedTerms === true && consent.requestedEarlyStart === true;
};

/** Shown directly before paying (Art. 8(2) of Directive 2011/83/EU): the total, that it is paid once, and how long the sector runs. */
export const HOSTED_SECTOR_PRICE_FACTS =
  "One single payment, tax included; no subscription. A hosted sector has no fixed end: it stays open for 3 days after its Sector Contest ends, and closes after 7 days in which no member visits.";
