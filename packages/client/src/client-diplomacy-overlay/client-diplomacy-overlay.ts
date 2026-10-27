// Diplomacy map view: recolours every other empire's land by your standing with
// them (ally, truce, no agreement) and barbarian land grey. It works by swapping
// the owner colour itself (diplomacyOwnerColor, wired in client-map-facade.ts),
// so the 2D map, the 3D map and the minimap all repaint their own territory
// fill and borders rather than drawing a second layer on top. Toggled from the minimap.

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

/** Your own land in the Diplomacy view: a fixed blue outside the stance palette, so your own colour can never be mistaken for a stance. */
export const DIPLOMACY_SELF_COLOR = "#5b8fd6";
export const DIPLOMACY_SELF_LABEL = "You";

type StanceState = Pick<ClientState, "me" | "allies" | "activeTruces">;

export type DiplomacyStanceLookup = (ownerId: string | undefined) => DiplomacyOverlayStance | undefined;

/** Built once per frame/rebuild; undefined for your own and unowned land. */
export const diplomacyStanceLookup = (state: StanceState): DiplomacyStanceLookup => {
  const allies = new Set(state.allies);
  const truces = new Set(state.activeTruces.map((t) => t.otherPlayerId));
  return (ownerId) => {
    if (!ownerId || ownerId === state.me) return undefined;
    // Shared code knows both "barbarian" and "barbarian-1"; the rest of the client matches the prefix.
    if (ownerId.startsWith("barbarian")) return "barbarian";
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

/**
 * While the view is on, the colour an empire's land is painted in (your own in DIPLOMACY_SELF_COLOR); undefined
 * otherwise, so the caller falls back to the owner's own colour. The stance lookup is rebuilt only when alliances,
 * truces or the viewer change: those arrays are replaced, never mutated, on every update.
 */
export const diplomacyOwnerColor = (state: StanceState & Pick<ClientState, "showDiplomacyOverlay">): ((ownerId: string) => string | undefined) => {
  let builtFrom: { allies: readonly string[]; truces: StanceState["activeTruces"]; me: string } | undefined;
  let lookup: DiplomacyStanceLookup = () => undefined;
  return (ownerId) => {
    if (!state.showDiplomacyOverlay) return undefined;
    if (ownerId === state.me) return DIPLOMACY_SELF_COLOR;
    if (!builtFrom || builtFrom.allies !== state.allies || builtFrom.truces !== state.activeTruces || builtFrom.me !== state.me) {
      builtFrom = { allies: state.allies, truces: state.activeTruces, me: state.me };
      lookup = diplomacyStanceLookup(state);
    }
    const stance = lookup(ownerId);
    return stance ? DIPLOMACY_OVERLAY_COLORS[stance] : undefined;
  };
};
