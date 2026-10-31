// Feeds the 3D scene's in-flight ship overlay (client-space-fleet-overlay.ts)
// from two sources: the player's own legacy fleet orders, and every Duke raid
// in the air (§29.4, from the Duke status). Raids are public, so every player
// sees each one as a Fighter flying from its system to its target, the 3D
// counterpart of the strategic map's dashed raid course.
import type { FleetOverlayOrder } from "./client-space-map-3d/client-space-fleet-overlay.js";
import type { DukePublicRaid } from "../client-duke-panel/client-duke-types.js";

export const dukeRaidsAsFleetOrders = (raids: ReadonlyArray<DukePublicRaid>): FleetOverlayOrder[] =>
  raids.map((r) => ({
    id: `duke-raid:${r.fromSeasonId}:${r.seasonId}:${r.launchedAt}`,
    // Origin is always the raider's own system, so no owner is needed to place it.
    ownerAuthUid: "",
    originSeasonId: r.fromSeasonId,
    targetSeasonId: r.seasonId,
    composition: { RAIDER: 1 },
    departsAt: r.launchedAt,
    sentAt: r.launchedAt,
    arrivesAt: r.arrivesAt
  }));

export type FleetOverlayFeed = {
  setLegacy: (orders: ReadonlyArray<FleetOverlayOrder>) => void;
  setRaids: (raids: ReadonlyArray<DukePublicRaid>) => void;
};

export const createFleetOverlayFeed = (apply: (orders: ReadonlyArray<FleetOverlayOrder>) => void): FleetOverlayFeed => {
  let legacy: ReadonlyArray<FleetOverlayOrder> = [];
  let raids: ReadonlyArray<FleetOverlayOrder> = [];
  return {
    setLegacy: (orders) => {
      legacy = orders;
      apply([...legacy, ...raids]);
    },
    setRaids: (next) => {
      raids = dukeRaidsAsFleetOrders(next);
      apply([...legacy, ...raids]);
    }
  };
};
