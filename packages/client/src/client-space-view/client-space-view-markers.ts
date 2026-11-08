// What each system shows on the map (design doc §31), derived from the Duke
// status and shared by both renderers: the 3D galaxy and system view
// (client-space-system-markers.ts) and the 2D strategic map. Pure.
import { formatDuration } from "../client-duke-panel/client-duke-format.js";
import type { DukeStatus } from "../client-duke-panel/client-duke-types.js";

export type BodyMarker = { base: boolean; developed: boolean; building: boolean };

export type SystemMarkers = {
  // A raid or Warden got through here lately: the planet smokes. Public.
  smoking: boolean;
  // One of your systems with a build in progress.
  building: boolean;
  // One of your Probes is orbiting it.
  watched: boolean;
  // Your own systems only: each orbiting body's base, development and build.
  bodies: BodyMarker[];
};

export const NO_MARKERS: SystemMarkers = { smoking: false, building: false, watched: false, bodies: [] };

export const systemMarkersFromStatus = (status: DukeStatus | undefined): Map<string, SystemMarkers> => {
  const markers = new Map<string, SystemMarkers>();
  if (!status) return markers;
  const get = (seasonId: string): SystemMarkers => {
    const known = markers.get(seasonId);
    if (known) return known;
    const fresh: SystemMarkers = { ...NO_MARKERS, bodies: [] };
    markers.set(seasonId, fresh);
    return fresh;
  };
  for (const hit of status.recentHits ?? []) get(hit.seasonId).smoking = true;
  for (const orbit of status.orbiting) get(orbit.seasonId).watched = true;
  for (const s of status.systems) {
    const m = get(s.seasonId);
    m.building = s.slot !== null;
    m.bodies = s.bodies.map((b) => ({ base: b.base, developed: b.development !== null, building: s.slot?.bodyIndex === b.index }));
  }
  return markers;
};

// Why a planet is smoking, said when the player presses it (§31). Undefined
// when it is not.
export const smokeReason = (status: DukeStatus | undefined, seasonId: string, now: number): string | undefined => {
  const hit = (status?.recentHits ?? []).find((h) => h.seasonId === seasonId);
  if (!hit) return undefined;
  const ago = `${formatDuration(now - hit.at)} ago`;
  return hit.by === "WARDEN" ? `Smoking: Wardens got through ${ago} and cost it 20 Stability.` : `Smoking: a rival's raid got through ${ago} and cost it 20 Stability.`;
};
