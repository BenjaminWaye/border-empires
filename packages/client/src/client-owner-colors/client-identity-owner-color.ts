import type { ClientState } from "../client-state/client-state.js";
import { createSeparatedOwnerColor } from "./client-owner-color-separation.js";
import { fallbackOwnerColor, resolveOwnerColor } from "./client-owner-colors.js";

/**
 * An empire's own colour for HUD crests and badges (nav, Ranks, Diplomacy,
 * Chronicle, battle cards). Same viewer-local rival spacing as the map, but
 * never the Diplomacy lens recolour: that lens paints your land a fixed blue
 * and others by stance (hostile red, truce gold), which made a player who
 * picked dark red see a blue crest and a rival's crest flip red -> gold when a
 * truce started (playtest 2026-11-12). The lens recolours territory only.
 */
export const createIdentityOwnerColor = (state: Pick<ClientState, "me" | "playerColors">): ((ownerId: string) => string) =>
  createSeparatedOwnerColor((ownerId) => resolveOwnerColor(ownerId, state.playerColors, fallbackOwnerColor), () => state.me);
