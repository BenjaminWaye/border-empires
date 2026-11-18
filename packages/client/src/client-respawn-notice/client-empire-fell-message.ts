// Plain "your empire fell" copy for an elimination respawn notice. Playtest:
// three players were wiped out while offline and respawned with only the
// recovery-diagnostics overlay (written for sign-in/startup repair bugs), so
// they could not tell what had happened. Recovery reasons keep that overlay.
import type { PlayerRespawnNotice } from "../client-types.js";

/** "(12, 34)" from the notice's "12,34" spawn tile key. */
const spawnCoordsLabel = (spawnTileKey: string | undefined): string | undefined => {
  const [x, y] = (spawnTileKey ?? "").split(",").map((part) => Number(part.trim()));
  return spawnTileKey && Number.isFinite(x) && Number.isFinite(y) ? `(${x}, ${y})` : undefined;
};

export const isEmpireFellNotice = (notice: PlayerRespawnNotice): boolean => notice.reasonCode === "eliminated";

/** Barbarians have no player name; anyone else unknown to the client stays unnamed. */
const captorLabel = (captorId: string, nameOf: (playerId: string) => string | undefined): string | undefined =>
  captorId.startsWith("barbarian") ? "the barbarians" : nameOf(captorId);

export const empireFellMessage = (notice: PlayerRespawnNotice, nameOf: (playerId: string) => string | undefined): string => {
  const coords = spawnCoordsLabel(notice.spawnTileKey);
  const newStart = coords ? `You've been given a new start at ${coords}.` : "You've been given a new start.";
  if (notice.withdrawn) return `You withdrew your House. ${newStart}`;
  const captor = notice.fellToPlayerId ? captorLabel(notice.fellToPlayerId, nameOf) : undefined;
  return captor ? `Your empire fell to ${captor}. ${newStart}` : `Your empire fell. ${newStart}`;
};
