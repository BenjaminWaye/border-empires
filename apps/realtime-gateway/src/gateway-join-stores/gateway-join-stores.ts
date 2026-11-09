// Stores behind the two ways into a Sector Contest besides a direct join:
// rally links (an invite to land next to a friend) and the waitlist for the
// next Sector when the current one is full. Grouped so gateway-app.ts, which
// is over the file-line budget and may not grow, creates both in one call.
import { createGatewayRallyLinkStore } from "../rally-link-store-factory.js";
import type { RallyLinkStore } from "../rally-link-store/rally-link-store.js";
import { createSectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store-factory.js";
import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

export const createGatewayJoinStores = async (options: {
  sqlitePath?: string;
  applySchema?: boolean;
}): Promise<{ rallyLinkStore: RallyLinkStore; sectorWaitlistStore: SectorWaitlistStore }> => {
  const [rallyLinkStore, sectorWaitlistStore] = await Promise.all([
    createGatewayRallyLinkStore(options),
    createSectorWaitlistStore(options)
  ]);
  return { rallyLinkStore, sectorWaitlistStore };
};
