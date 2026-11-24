// Stores behind the two ways into a Sector Contest besides a direct join:
// rally links (an invite to land next to a friend) and the waitlist for the
// next Sector when the current one is full. Grouped so gateway-app.ts, which
// is over the file-line budget and may not grow, creates them in one call.
// The public profile link store (public-house-profile/) rides along for the
// same reason.
import { createGatewayRallyLinkStore } from "../rally-link-store-factory.js";
import type { RallyLinkStore } from "../rally-link-store/rally-link-store.js";
import { createSectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store-factory.js";
import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import { createPublicProfileLinkStore } from "../public-house-profile/public-profile-link-store-factory.js";
import type { PublicProfileLinkStore } from "../public-house-profile/public-profile-link-store.js";

export const createGatewayJoinStores = async (options: {
  sqlitePath?: string;
  applySchema?: boolean;
}): Promise<{ rallyLinkStore: RallyLinkStore; sectorWaitlistStore: SectorWaitlistStore; publicProfileLinkStore: PublicProfileLinkStore }> => {
  const [rallyLinkStore, sectorWaitlistStore, publicProfileLinkStore] = await Promise.all([
    createGatewayRallyLinkStore(options),
    createSectorWaitlistStore(options),
    createPublicProfileLinkStore(options)
  ]);
  return { rallyLinkStore, sectorWaitlistStore, publicProfileLinkStore };
};
