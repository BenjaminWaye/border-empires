import { appendPlayerEventLogEntry, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";

type TownPopulationTier = NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]>;

export type OwnershipChangeSample = {
  tileKey: string;
  x: number;
  y: number;
  previousOwnerId: string | undefined;
  nextOwnerId: string | undefined;
  commandId: string;
  hadTown: boolean;
  townLost: boolean;
  hadOwnershipState: string | undefined;
  previousTownPopulationTier: TownPopulationTier | undefined;
};

// Builds the onOwnershipChange sample for a tile write, or undefined if
// nothing worth reporting changed (same owner, town still present). townLost
// fires whenever a town existed before and is gone now (e.g. capturedTownAftermath
// razing a SETTLEMENT-tier town on capture) — distinct from ownerId changing,
// since a captured town above SETTLEMENT tier usually survives.
export const buildOwnershipChangeSample = (
  tileKey: string,
  tile: DomainTileState,
  previous: DomainTileState | undefined,
  commandId: string
): OwnershipChangeSample | undefined => {
  if (!previous) return undefined;
  const townLost = Boolean(previous.town) && !tile.town;
  if (previous.ownerId === tile.ownerId && !townLost) return undefined;
  return {
    tileKey,
    x: tile.x,
    y: tile.y,
    previousOwnerId: previous.ownerId,
    nextOwnerId: tile.ownerId,
    commandId,
    hadTown: Boolean(previous.town),
    townLost,
    hadOwnershipState: previous.ownershipState,
    previousTownPopulationTier: previous.town?.populationTier
  };
};

// §20: "[Town] was captured by [Player/Barbarians]." — barbarian ids follow
// the "barbarian-N" convention used consistently elsewhere (e.g.
// world-status-snapshot.ts's displayNameForPlayer); an undefined nextOwnerId
// means the tile went back to unowned/neutral, not captured by anyone.
export const displayNameForOwnershipChange = (
  nextOwnerId: string | undefined,
  players: ReadonlyMap<string, Pick<DomainPlayer, "name">>
): string => {
  if (!nextOwnerId) return "no one";
  if (nextOwnerId.startsWith("barbarian-")) return "Barbarians";
  return players.get(nextOwnerId)?.name ?? nextOwnerId;
};

// §20: "town lost" is a launch event type for the durable per-player event
// log. Deliberately keyed on ownership actually changing hands on a town
// tile (hadTown + previousOwnerId + owner changed), NOT on the narrower
// `townLost` flag: `townLost` only means the town *structure* disappeared,
// which capturedTownAftermath.ts shows does NOT happen for TOWN tier and
// above (only SETTLEMENT-tier towns get razed on capture) — using `townLost`
// here would silently skip the single most common case this event exists
// for, a rival capturing a real (TOWN+) town. Unlike the ops-alert's
// isSettlementTierTownLoss filter (Slack-noise reduction for admins), this
// fires for every tier: losing even a SETTLEMENT is a real, personally
// relevant loss to the player, whether or not it's worth paging ops about.
export const appendTownLostEventLogIfApplicable = (
  sample: OwnershipChangeSample,
  previousTown: DomainTileState["town"] | undefined,
  players: ReadonlyMap<string, DomainPlayer>,
  now: number
): void => {
  const previousTownOwnerId = sample.previousOwnerId;
  const lostTownOwnership = sample.hadTown && previousTownOwnerId && previousTownOwnerId !== sample.nextOwnerId;
  if (!lostTownOwnership) return;
  const loser = players.get(previousTownOwnerId);
  if (!loser) return;
  const townName = previousTown?.name ?? `Town at ${sample.tileKey}`;
  const text = sample.nextOwnerId
    ? `${townName} was captured by ${displayNameForOwnershipChange(sample.nextOwnerId, players)}.`
    : `${townName} was lost.`;
  appendPlayerEventLogEntry(loser, { type: "TOWN_LOST", text, occurredAt: now });
};
