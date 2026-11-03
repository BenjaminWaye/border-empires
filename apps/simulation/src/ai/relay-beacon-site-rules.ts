import { OUTPOST_REACH_RADIUS, chebyshevWithWrap } from "@border-empires/shared";

/**
 * Spacing rule for chooseBestRelayBeaconBuild's candidates. It applies only
 * to exploration-only sites — ones whose new reach holds no unowned prize
 * (town, resource, dock, wonder). A beacon that brings a prize into reach is
 * worth its slot however close it sits to another beacon: a coastal relay
 * that only adds four fish tiles is a good build. It also can't repeat —
 * once the prize is in reach it stops counting — so prize sites can't ring
 * an island the way fog slivers did.
 *
 * Deliberately no minimum on how much new ground a site must add: a chain
 * step of OUTPOST_REACH_RADIUS along a 3-wide isthmus only opens ~15 tiles,
 * and rejecting it would strand the AI on WAIT short of the land beyond.
 */

// Minimum distance between an exploration-only site and one of this
// player's own beacons. overlapsPendingOutpost only covers beacons still
// under construction, so once one finished, a site two tiles along the
// border could win again on the few fogged cells poking past its box.
// Staging season-40 ai-18 ringed a 151-tile island with ~25 beacons that way.
// Set to OUTPOST_REACH_RADIUS, not the full box width: a FRONTIER site must
// sit inside existing reach to be settled, so the next beacon in a chain can
// be at most one reach radius from the last.
export const MIN_OWN_BEACON_SPACING = OUTPOST_REACH_RADIUS;

/** A beacon the AI switched off for FOOD relief (inactiveReason "manual")
 *  counts, since chooseManuallyDisabledBeaconToReenable turns it back on —
 *  but only on a SETTLED tile, the only place that re-enable is accepted.
 *  One being demolished, or disabled for any other reason, never comes back
 *  on, so counting it would block its area forever. */
export const countsForBeaconSpacing = (
  beacon: { status?: string | undefined; inactiveReason?: string | undefined },
  ownershipState: string | undefined
): boolean =>
  beacon.status === "inactive"
    ? beacon.inactiveReason === "manual" && ownershipState === "SETTLED"
    : beacon.status !== "removing";

/** Per-call tally of exploration-only candidates the spacing rule turned
 *  away, for sim_ai_relay_beacon_site_skipped_total. */
export type RelayBeaconSiteSkips = { spacing: number };

/** True when an exploration-only candidate sits too close to one of this player's beacons. */
export const explorationSiteTooClose = (
  tile: { x: number; y: number },
  hasValuable: boolean,
  ownBeacons: readonly { x: number; y: number }[]
): boolean =>
  !hasValuable && ownBeacons.some((b) => chebyshevWithWrap(tile.x, tile.y, b.x, b.y) < MIN_OWN_BEACON_SPACING);
