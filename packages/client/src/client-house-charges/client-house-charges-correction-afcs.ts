// A Writ of Correction's rival AFCs the player can see. The server sends only
// the charge's rough search circle, never the rival's landing site
// (house-charges-view.ts), so the dotted circle is the only guide until the
// player finds an AFC the rival founded. Once one is on explored ground (the
// rival's own, or one the player has captured: the founder survives capture),
// the circle has done its job: both map renderers ring the AFC with the
// onboarding highlight instead, and the card asks for a garrison while the
// player's captured one is still unsettled (owner report 2026-11-23).
//
// Found anywhere on the map, so it is a scan of the client's tiles: cached per
// tile revision (state.tilesRevision), so a frame that changed no tile reuses it.
import { afcFoundedBy, type HouseChargeView } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { correctionRivalId } from "./client-house-charges-live-names.js";

export type CorrectionAfc = { x: number; y: number; ownedByMe: boolean; garrisoned: boolean };

type AfcState = Pick<ClientState, "tiles" | "me"> & Partial<Pick<ClientState, "tilesRevision">>;

/** At most this many AFCs are ringed: the 3D ring overlay draws 32 markers in all. */
const MAX_FOUND = 8;

let cache: { tiles: ClientState["tiles"]; revision: number; rivalId: string; me: string; found: CorrectionAfc[] } | undefined;

const scan = (tiles: ClientState["tiles"], rivalId: string, me: string): CorrectionAfc[] => {
  const found: CorrectionAfc[] = [];
  for (const tile of tiles.values()) {
    if (!tile.afc || afcFoundedBy(tile.afc) !== rivalId) continue;
    const ownedByMe = tile.ownerId === me && tile.afc.ownerId === me;
    found.push({ x: tile.x, y: tile.y, ownedByMe, garrisoned: ownedByMe && tile.ownershipState === "SETTLED" });
  }
  // Ones the player holds first: they are what the Writ is about once it is taken.
  return found.sort((a, b) => Number(b.ownedByMe) - Number(a.ownedByMe)).slice(0, MAX_FOUND);
};

/** Explored AFCs the Writ's rival House founded; empty for any other charge. */
export const correctionAfcsInView = (charge: HouseChargeView, state: AfcState): CorrectionAfc[] => {
  const rivalId = correctionRivalId(charge);
  if (!rivalId) return [];
  const revision = state.tilesRevision ?? -1;
  // No revision (tests, callers without one): never reuse.
  if (revision >= 0 && cache && cache.tiles === state.tiles && cache.revision === revision && cache.rivalId === rivalId && cache.me === state.me) return cache.found;
  const found = scan(state.tiles, rivalId, state.me);
  cache = { tiles: state.tiles, revision, rivalId, me: state.me, found };
  return found;
};

/** Whether the Writ no longer needs its search circle: held, or an AFC its rival founded is in view. */
export const correctionSearchDone = (charge: HouseChargeView, state: AfcState): boolean =>
  charge.kind === "CORRECTION" && (charge.held || correctionAfcsInView(charge, state).length > 0);

/** The card's nudge while the player owns the rival's AFC but has not garrisoned it, so the Writ is not held yet. */
export const correctionGarrisonHint = (charge: HouseChargeView, state: AfcState, house: string): string | undefined => {
  if (charge.kind !== "CORRECTION" || charge.held) return undefined;
  return correctionAfcsInView(charge, state).some((afc) => afc.ownedByMe && !afc.garrisoned) ? `${house}'s AFC taken: garrison it to hold the Writ` : undefined;
};
