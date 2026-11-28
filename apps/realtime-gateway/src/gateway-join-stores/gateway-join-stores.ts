// Stores behind the two ways into a Sector Contest besides a direct join:
// rally links (an invite to land next to a friend) and the waitlist for the
// next Sector when the current one is full. Grouped so gateway-app.ts, which
// is over the file-line budget and may not grow, creates them in one call.
// The public profile link store (public-house-profile/) and the hosted
// results shown on that profile (hosted-profile-results/) ride along for the
// same reason.
import { createGatewayRallyLinkStore } from "../rally-link-store-factory.js";
import type { RallyLinkStore } from "../rally-link-store/rally-link-store.js";
import { createSectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store-factory.js";
import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";
import { createPublicProfileLinkStore } from "../public-house-profile/public-profile-link-store-factory.js";
import type { PublicProfileLinkStore } from "../public-house-profile/public-profile-link-store.js";
import { createHostedProfileResultsStore } from "../hosted-profile-results/hosted-profile-results-store-factory.js";
import type { HostedProfileResultsStore } from "../hosted-profile-results/hosted-profile-results-store.js";

export const createGatewayJoinStores = async (options: {
  sqlitePath?: string;
  applySchema?: boolean;
}): Promise<{ rallyLinkStore: RallyLinkStore; sectorWaitlistStore: SectorWaitlistStore; publicProfileLinkStore: PublicProfileLinkStore; hostedProfileResultsStore: HostedProfileResultsStore }> => {
  const [rallyLinkStore, sectorWaitlistStore, publicProfileLinkStore, hostedProfileResultsStore] = await Promise.all([
    createGatewayRallyLinkStore(options),
    createSectorWaitlistStore(options),
    createPublicProfileLinkStore(options),
    createHostedProfileResultsStore(options)
  ]);
  return { rallyLinkStore, sectorWaitlistStore, publicProfileLinkStore, hostedProfileResultsStore };
};
