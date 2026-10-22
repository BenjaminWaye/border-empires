// Opens the "Name this landmass" dialog once, the first time the player holds
// every land tile of a landmass in garrison. Checked from the player's own
// garrisons whenever tiles change (at most every CHECK_MIN_INTERVAL_MS), so a
// landmass completed while the player was away prompts on their next login.
// "Once" is remembered with the account's server-saved hint state
// (client-discovery-tips-storage.ts), keyed by world seed + landmass so a new
// season's world asks again.
import { getWorldSeed, terrainAt } from "@border-empires/shared";
import { isDiscoveryTipSeen, markDiscoveryTipSeen } from "../client-discovery-tips/client-discovery-tips-storage.js";
import type { ClientState } from "../client-state/client-state.js";
import { fullyHeldIslandIds } from "./client-island-hold.js";
import { isLandmassNameDialogOpen, openLandmassNameDialog } from "./client-landmass-name-dialog.js";

const CHECK_MIN_INTERVAL_MS = 2_000;

export const landmassPromptKey = (worldSeed: number, islandId: string): string => `landmass-name:${worldSeed}:${islandId}`;

export type LandmassNamePromptDeps = {
  readonly state: Pick<ClientState, "me" | "tiles" | "tilesRevision" | "islandLabels" | "authEmail" | "connection">;
  readonly sendGameMessage: (payload: unknown, message?: string) => boolean;
};

export const createLandmassNamePrompt = (deps: LandmassNamePromptDeps): { readonly tick: (nowMs: number) => void } => {
  let checkedRevision = -1;
  let checkedAt = Number.NEGATIVE_INFINITY;
  let checkedLabels: unknown;
  return {
    tick: (nowMs) => {
      const { state } = deps;
      if (state.connection !== "initialized" || !state.me || !state.islandLabels || isLandmassNameDialogOpen()) return;
      const changed = state.tilesRevision !== checkedRevision || state.islandLabels !== checkedLabels;
      if (!changed || nowMs - checkedAt < CHECK_MIN_INTERVAL_MS) return;
      checkedRevision = state.tilesRevision;
      checkedLabels = state.islandLabels;
      checkedAt = nowMs;
      const ownGarrisons = [...state.tiles.values()].filter((tile) => tile.ownerId === state.me && tile.ownershipState === "SETTLED" && tile.terrain === "LAND");
      if (ownGarrisons.length === 0) return;
      const heldIds = fullyHeldIslandIds(ownGarrisons, { me: state.me, tileAt: (x, y) => state.tiles.get(`${x},${y}`), terrainAt });
      const worldSeed = getWorldSeed();
      for (const islandId of heldIds) {
        const key = landmassPromptKey(worldSeed, islandId);
        if (isDiscoveryTipSeen(key, state.authEmail)) continue;
        const label = state.islandLabels.find((entry) => entry.id === islandId);
        if (!label) continue; // not a nameable landmass on the server (or its list hasn't caught up yet)
        markDiscoveryTipSeen(key, state.authEmail);
        if (label.namerId === state.me) continue; // already named it
        const [x, y] = islandId.split(",").map(Number) as [number, number];
        // The new name shows on the map once the simulation confirms it (ISLAND_NAMES).
        openLandmassNameDialog(label.name, (name) => deps.sendGameMessage({ type: "NAME_ISLAND", x, y, name }, "Finish sign-in before naming a landmass."));
        checkedRevision = -1; // one dialog at a time; recheck for any other completed landmass once it closes
        return;
      }
    }
  };
};
