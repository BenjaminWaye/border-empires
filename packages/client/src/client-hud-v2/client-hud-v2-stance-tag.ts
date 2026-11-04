// Your standing with a tile's owner, as a small tag before their name in the
// tile panel ("Ally", "Truce 6h", "Hostile"). It is a tag, not a name tint, so
// it never clashes with the founding-engineer and Duke name styling, and it
// explains the Diplomacy lens colours without a legend.

import { DIPLOMACY_OVERLAY_LABELS, diplomacyStanceLookup } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import type { ClientState } from "../client-state/client-state.js";
import { socialRemainingLabel } from "../client-panel-html/client-panel-html.js";

type StanceTagState = Pick<ClientState, "me" | "allies" | "activeTruces">;

/** Empty for your own and unowned tiles. */
export const ownerStanceTagHtml = (ownerId: string | undefined, state: StanceTagState, nowMs: number): string => {
  const stance = diplomacyStanceLookup(state)(ownerId);
  if (!stance) return "";
  const truce = stance === "truce" ? state.activeTruces.find((t) => t.otherPlayerId === ownerId) : undefined;
  const label = truce ? `${DIPLOMACY_OVERLAY_LABELS.truce} ${socialRemainingLabel(truce.endsAt, nowMs)}` : DIPLOMACY_OVERLAY_LABELS[stance];
  return `<span class="hud-v2-stance-tag hud-v2-stance-${stance}">${label}</span>`;
};
