// Recommended Relay Beacon sites for the placement overlay, shared by the 2D
// canvas preview (client-placement-preview-2d.ts) and the true-3D placement
// overlay (client-map-3d-beacon-placement-overlay.ts). Both renderers ask
// every frame while placement is active, so the scan is cached on the
// tiles/reach revisions and only reruns when the map actually changes.

import { resolveMyReachCached, type ReachCacheState } from "../client-reach-authoritative/client-reach-authoritative.js";
import { bestRelayBeaconSites, type RelayBeaconSite } from "./client-relay-beacon-site.js";

/** How many alternative spots to mark at once. */
export const RELAY_BEACON_RECOMMENDED_SITE_COUNT = 3;

let cache: { key: string; sites: readonly RelayBeaconSite[] } | undefined;

export const relayBeaconPlacementSites = (state: ReachCacheState): readonly RelayBeaconSite[] => {
  const reach = resolveMyReachCached(state);
  const key = `${state.me}|${state.tilesRevision}|${state.myReachRevisionAtCompute}`;
  if (cache?.key === key) return cache.sites;
  const sites = bestRelayBeaconSites(state.tiles, state.me, { reach, limit: RELAY_BEACON_RECOMMENDED_SITE_COUNT });
  cache = { key, sites };
  return sites;
};

/** Test-only: drops the memoized sites so a test's fresh state isn't served a previous test's answer. */
export const resetRelayBeaconPlacementSitesForTests = (): void => {
  cache = undefined;
};
