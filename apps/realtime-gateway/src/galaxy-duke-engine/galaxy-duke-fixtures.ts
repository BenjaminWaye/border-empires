import { galaxySystemBodies } from "@border-empires/shared";

import { createDukeState, type HeldSector } from "./galaxy-duke-systems.js";
import type { DukeState } from "./galaxy-duke-types.js";

// Test helpers shared by the engine tests.
export const planet = (seasonId: string, specialization: HeldSector["specialization"] = "INDUSTRIAL"): HeldSector => ({ seasonId, tier: "PLANET", specialization });

export const duke = (planets: ReadonlyArray<HeldSector> = [planet("s1")], now = 0, authUid = "uid-a"): DukeState => createDukeState(authUid, planets, now, 0);

// First system id whose bodies include `kind` at some index, so tests can build
// a specific development without hard-coding hash outputs.
export const seasonWithBody = (kind: "GAS_GIANT" | "ASTEROID_BELT" | "ICE_MOON"): { seasonId: string; bodyIndex: number } => {
  for (let i = 0; i < 200; i += 1) {
    const seasonId = `season-${i}`;
    const bodyIndex = galaxySystemBodies(seasonId).indexOf(kind);
    if (bodyIndex >= 0) return { seasonId, bodyIndex };
  }
  throw new Error(`no system with a ${kind}`);
};
