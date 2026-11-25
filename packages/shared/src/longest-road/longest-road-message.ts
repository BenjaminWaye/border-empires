// LONGEST_ROAD push: who holds Longest Road right now (simulation
// longest-road-ticker.ts). Town names and length only, no coordinates, so it
// does not reveal where a rival's towns are.
export const LONGEST_ROAD_MESSAGE_TYPE = "LONGEST_ROAD";

export type LiveLongestRoad = {
  playerId: string;
  playerName: string;
  tileCount: number;
  fromTown: string;
  toTown: string;
};

export type LongestRoadPayload = { type: typeof LONGEST_ROAD_MESSAGE_TYPE; road: LiveLongestRoad | null };

/** Parses a LONGEST_ROAD message; undefined for anything malformed. */
export const parseLongestRoadPayload = (msg: Record<string, unknown>): LiveLongestRoad | null | undefined => {
  if (msg.type !== LONGEST_ROAD_MESSAGE_TYPE) return undefined;
  if (msg.road === null) return null;
  const road = msg.road as Partial<LiveLongestRoad> | undefined;
  if (!road || typeof road.playerId !== "string" || typeof road.playerName !== "string" || typeof road.tileCount !== "number" || typeof road.fromTown !== "string" || typeof road.toTown !== "string") return undefined;
  return { playerId: road.playerId, playerName: road.playerName, tileCount: road.tileCount, fromTown: road.fromTown, toTown: road.toTown };
};
