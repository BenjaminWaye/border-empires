// Your standing with a tile's owner, as a small tag before their name in the
// tile panel ("Ally", "Truce 6h", "Hostile"). It is a tag, not a name tint, so
// it never clashes with the founding-engineer and Duke name styling, and it
// explains the Diplomacy lens colours without a legend.

import { DIPLOMACY_OVERLAY_LABELS, diplomacyStanceLookup } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import type { ClientState } from "../client-state/client-state.js";

type StanceTagState = Pick<ClientState, "me" | "allies" | "activeTruces">;

/** Rounded up, so a truce in its last hour still reads "1h". */
const hoursLeft = (endsAt: number, nowMs: number): number => Math.max(1, Math.ceil((endsAt - nowMs) / 3_600_000));

/** Empty for your own and unowned tiles. */
export const ownerStanceTagHtml = (ownerId: string | undefined, state: StanceTagState, nowMs: number): string => {
  const stance = diplomacyStanceLookup(state)(ownerId);
  if (!stance) return "";
  const truce = stance === "truce" ? state.activeTruces.find((t) => t.otherPlayerId === ownerId) : undefined;
  const label = truce ? `${DIPLOMACY_OVERLAY_LABELS.truce} ${hoursLeft(truce.endsAt, nowMs)}h` : DIPLOMACY_OVERLAY_LABELS[stance];
  return `<span class="hud-v2-stance-tag hud-v2-stance-${stance}">${label}</span>`;
};
