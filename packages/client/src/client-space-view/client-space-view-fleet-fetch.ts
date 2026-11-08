// The two small fetches behind Space View's ships and threat rings, moved out
// of client-space-view.ts (at the line cap): the caller's own legacy fleet
// orders for the 3D ship overlay, and which of its territories have a raid
// inbound (a pulsing red ring in that solar system). Each keeps showing its
// last-known state on a network hiccup.
import type { Auth } from "firebase/auth";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import type { FleetHullClassId } from "../client-fleet-panel/client-fleet-panel-html.js";
import type { SpaceScene } from "./client-space-map-3d/client-space-map-3d.js";
import type { FleetOverlayFeed } from "./client-space-view-raid-feed.js";

type RawFleetOrderForOverlay = {
  id: string;
  ownerAuthUid: string;
  originSeasonId?: string;
  targetSeasonId: string;
  composition: Partial<Record<FleetHullClassId, number>>;
  sentAt: number;
  departsAt?: number;
  arrivesAt: number;
  status: "TRAVELING" | "RESOLVED";
};

export type SpaceFleetFetcherDeps = {
  firebaseAuth: Auth | undefined;
  wsUrl: string;
  getScene: () => SpaceScene | undefined;
  feed: FleetOverlayFeed;
};

export type SpaceFleetFetcher = {
  refreshFleetOverlay: () => Promise<void>;
  refreshThreats: () => Promise<void>;
  isUnderThreat: (seasonId: string) => boolean;
};

export const createSpaceFleetFetcher = (deps: SpaceFleetFetcherDeps): SpaceFleetFetcher => {
  let threatened = new Set<string>();
  const getJson = async <T,>(path: string): Promise<T | undefined> => {
    const user = deps.firebaseAuth?.currentUser;
    if (!user || !deps.getScene()) return undefined;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${rallyApiOrigin(deps.wsUrl)}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (!response.ok) return undefined;
      return (await response.json().catch(() => undefined)) as T | undefined;
    } catch {
      return undefined;
    }
  };
  return {
    refreshFleetOverlay: async () => {
      const body = await getJson<{ orders?: RawFleetOrderForOverlay[] }>("/hq/galaxy/fleets");
      if (body) deps.feed.setLegacy((body.orders ?? []).filter((o) => o.status === "TRAVELING"));
    },
    refreshThreats: async () => {
      const body = await getJson<{ threats?: Array<{ targetSeasonId: string }> }>("/hq/galaxy/fleets/incoming");
      if (!body) return;
      threatened = new Set((body.threats ?? []).map((t) => t.targetSeasonId));
      deps.getScene()?.setThreats(threatened);
    },
    isUnderThreat: (seasonId) => threatened.has(seasonId)
  };
};
