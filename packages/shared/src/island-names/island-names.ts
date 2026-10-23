// Island naming rules, shared by the simulation (authority), the gateway
// (replay) and the client (labels + rename prompt).
//
// Every island of at least ISLAND_NAME_MIN_LAND_TILES LAND tiles carries a
// generated name. A player who garrisons (SETTLED) every LAND tile of it may
// rename it. The chosen name then lives through partial losses:
//   held       namer garrisons every LAND tile
//   contested  namer still garrisons >= ISLAND_NAME_CONTESTED_MIN_SHARE of it
//   fading     namer dropped below that share; the name reverts to the
//              generated one ISLAND_NAME_FADE_MS later unless they recover
// Another player who garrisons the whole island may rename it at any time.
import { validatePlaceName, type ValidatePlaceNameResult } from "../place-name-policy/place-name-policy.js";

export const ISLAND_NAME_MIN_LAND_TILES = 9;
export const ISLAND_NAME_CONTESTED_MIN_SHARE = 0.6;
export const ISLAND_NAME_FADE_MS = 24 * 60 * 60 * 1000;
export const ISLAND_NAME_MIN_LENGTH = 3;
export const ISLAND_NAME_MAX_LENGTH = 28;
export const ISLAND_NAMES_MESSAGE_TYPE = "ISLAND_NAMES";

export type IslandNameStatus = "default" | "held" | "contested" | "fading";

/** One island's map label, as pushed to every client in ISLAND_NAMES. */
export type IslandLabel = {
  /** Stable island id: the island's anchor tile key ("x,y"). */
  id: string;
  /** Label centre in world tile coordinates (wrapped into the world). */
  x: number;
  y: number;
  /** Long-axis direction in radians, kept within (-PI/2, PI/2] so text never reads upside down. */
  angle: number;
  /** Island extent along the long axis, in tiles. */
  span: number;
  /** Island extent across the long axis, in tiles. */
  thickness: number;
  name: string;
  status: IslandNameStatus;
  /** Player who chose `name`; absent while the generated name shows. */
  namerId?: string;
  /** While fading: epoch ms the chosen name reverts. */
  revertsAt?: number;
};

export type IslandNamesPayload = { type: typeof ISLAND_NAMES_MESSAGE_TYPE; islands: IslandLabel[] };

/** A player's chosen name for one island, persisted on the namer's player record. */
export type IslandNameClaim = {
  islandId: string;
  name: string;
  namedAt: number;
  /** Set once the namer drops below the contested share; cleared if they recover. */
  fadingSince?: number;
};

export const validateIslandName = (raw: string): ValidatePlaceNameResult =>
  validatePlaceName(raw, { label: "landmass name", minLength: ISLAND_NAME_MIN_LENGTH, maxLength: ISLAND_NAME_MAX_LENGTH });

export type IslandClaimStanding = {
  /** LAND tiles of the island the namer currently garrisons. */
  namerGarrisoned: number;
  /** Every LAND tile of the island. */
  landTiles: number;
};

export type IslandClaimEvaluation =
  | { kind: "held" }
  | { kind: "contested" }
  | { kind: "fading"; fadingSince: number; revertsAt: number }
  | { kind: "reverted" };

export const isIslandFullyGarrisoned = (standing: IslandClaimStanding): boolean =>
  standing.landTiles > 0 && standing.namerGarrisoned >= standing.landTiles;

/**
 * Where a chosen name stands right now. `reverted` means the fade ran out and
 * the claim should be dropped; a fading claim whose namer climbs back above
 * the contested share becomes contested (or held) again and loses its timer.
 */
export const evaluateIslandClaim = (
  claim: Pick<IslandNameClaim, "fadingSince">,
  standing: IslandClaimStanding,
  nowMs: number
): IslandClaimEvaluation => {
  if (isIslandFullyGarrisoned(standing)) return { kind: "held" };
  const share = standing.landTiles > 0 ? standing.namerGarrisoned / standing.landTiles : 0;
  if (share >= ISLAND_NAME_CONTESTED_MIN_SHARE) return { kind: "contested" };
  const fadingSince = claim.fadingSince ?? nowMs;
  const revertsAt = fadingSince + ISLAND_NAME_FADE_MS;
  if (nowMs >= revertsAt) return { kind: "reverted" };
  return { kind: "fading", fadingSince, revertsAt };
};
