import type { TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import type { PersonalActivityDirection, PersonalActivityTerritoryCard } from "@border-empires/game-domain";

// Groups a player's territory flips into cards by direction + counterparty +
// a 10-minute time bucket + a 6-tile spatial bucket, so a card's location is
// already a single spatial cluster by construction (see docs/activity-
// dashboard-plan.md 2.2's "Center targets its largest spatial cluster" --
// the initial implementation centers the most recent tile in that cluster).
// Grouping on direction also keeps repeated loss/capture of the same tile
// historically truthful: a loss then a later regain fall into different
// groups rather than collapsing into one "current owner" card.
const GROUP_TIME_BUCKET_MS = 10 * 60_000;
const GROUP_SPATIAL_BUCKET_TILES = 6;

export const groupTerritoryFlipsForPlayer = (playerId: string, flips: readonly TerritoryFlip[]): PersonalActivityTerritoryCard[] => {
  const groups = new Map<string, { direction: PersonalActivityDirection; counterpartyPlayerId: string | undefined; flips: TerritoryFlip[] }>();
  for (const flip of flips) {
    const gained = flip.toOwner === playerId && flip.fromOwner !== playerId;
    const lost = flip.fromOwner === playerId && flip.toOwner !== playerId;
    if (!gained && !lost) continue;
    const direction: PersonalActivityDirection = gained ? "GAINED" : "LOST";
    const counterpartyPlayerId = gained ? flip.fromOwner : flip.toOwner;
    const timeBucket = Math.floor(flip.at / GROUP_TIME_BUCKET_MS);
    const spatialX = Math.floor(flip.x / GROUP_SPATIAL_BUCKET_TILES);
    const spatialY = Math.floor(flip.y / GROUP_SPATIAL_BUCKET_TILES);
    const key = `${direction}:${counterpartyPlayerId ?? "neutral"}:${timeBucket}:${spatialX}:${spatialY}`;
    const existing = groups.get(key);
    if (existing) {
      existing.flips.push(flip);
    } else {
      groups.set(key, { direction, counterpartyPlayerId, flips: [flip] });
    }
  }

  const cards: PersonalActivityTerritoryCard[] = [];
  for (const group of groups.values()) {
    const mostRecent = [...group.flips].sort((a, b) => b.at - a.at)[0]!;
    cards.push({
      kind: "TERRITORY_FLIP_GROUP",
      id: `territory:${group.direction}:${group.counterpartyPlayerId ?? "neutral"}:${mostRecent.at}:${mostRecent.x}:${mostRecent.y}`,
      occurredAt: mostRecent.at,
      direction: group.direction,
      counterpartyPlayerId: group.counterpartyPlayerId,
      tileCount: group.flips.length,
      x: mostRecent.x,
      y: mostRecent.y
    });
  }
  return cards;
};
