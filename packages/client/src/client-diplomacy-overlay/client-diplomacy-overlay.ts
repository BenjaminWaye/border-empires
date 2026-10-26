// Diplomacy map overlay: tints every other empire's land by your standing with
// them (ally, truce, no agreement) and barbarian land grey. Shared by both
// renderers (2D: client-map-2d-tile-intel.ts, 3D: client-map-3d-diplomacy-overlay.ts)
// so the two can't disagree on who is what. Toggled from the minimap.

import type { ClientState } from "../client-state/client-state.js";

export type DiplomacyOverlayStance = "ally" | "truce" | "none" | "barbarian";

export const DIPLOMACY_OVERLAY_STANCES: readonly DiplomacyOverlayStance[] = ["ally", "truce", "none", "barbarian"];

export const DIPLOMACY_OVERLAY_COLORS: Readonly<Record<DiplomacyOverlayStance, string>> = {
  ally: "#6fbf73",
  truce: "#e0a845",
  none: "#d06a5a",
  barbarian: "#8a8170"
};

export const DIPLOMACY_OVERLAY_LABELS: Readonly<Record<DiplomacyOverlayStance, string>> = {
  ally: "Ally",
  truce: "Truce",
  none: "No agreement",
  barbarian: "Barbarian"
};

const BARBARIAN_OWNER_ID = "barbarian-1";

type StanceState = Pick<ClientState, "me" | "allies" | "activeTruces">;

export type DiplomacyStanceLookup = (ownerId: string | undefined) => DiplomacyOverlayStance | undefined;

/** Built once per frame/rebuild; undefined for your own and unowned land. */
export const diplomacyStanceLookup = (state: StanceState): DiplomacyStanceLookup => {
  const allies = new Set(state.allies);
  const truces = new Set(state.activeTruces.map((t) => t.otherPlayerId));
  return (ownerId) => {
    if (!ownerId || ownerId === state.me) return undefined;
    if (ownerId === BARBARIAN_OWNER_ID) return "barbarian";
    if (allies.has(ownerId)) return "ally";
    if (truces.has(ownerId)) return "truce";
    return "none";
  };
};

/** What the 3D overlay was built from: empty while it's off, else the stances that decide each tint. */
export const diplomacyOverlayKey = (state: StanceState & Pick<ClientState, "showDiplomacyOverlay">): string =>
  state.showDiplomacyOverlay
    ? `on:${[...state.allies].sort().join(",")}|${state.activeTruces.map((t) => t.otherPlayerId).sort().join(",")}`
    : "";
