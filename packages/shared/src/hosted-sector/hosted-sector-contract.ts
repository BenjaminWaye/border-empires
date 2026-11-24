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

/** Launch price of one hosted sector, in US cents (owner decision 2026-11-23). */
export const HOSTED_SECTOR_PRICE_USD_CENTS = 2000;
