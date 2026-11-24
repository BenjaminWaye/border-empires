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
// tile revision (state.tilesRevision) and rival, so a frame that changed no tile
// reuses it. Derived only, never persisted (docs/agents/state-and-persistence-discipline.md).
import { afcFoundedBy, type HouseChargeView } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { correctionRivalId } from "./client-house-charges-live-names.js";

export type CorrectionAfc = { x: number; y: number; ownedByMe: boolean; garrisoned: boolean };

type AfcState = Pick<ClientState, "tiles" | "me"> & Partial<Pick<ClientState, "tilesRevision">>;

/** At most this many AFCs are ringed: the 3D ring overlay draws 32 markers in all. */
const MAX_FOUND = 8;

// One entry per rival House, all dropped together when the tiles change: tile identity, revision and count
// (a season reset clears the same Map without a revision bump). Bounded by the player's kept Writs.
let cacheKey: { tiles: ClientState["tiles"]; revision: number; size: number; me: string } | undefined;
const cacheByRival = new Map<string, CorrectionAfc[]>();

const scan = (tiles: ClientState["tiles"], rivalId: string, me: string): CorrectionAfc[] => {
  const found: CorrectionAfc[] = [];
  for (const tile of tiles.values()) {
    if (!tile.afc || afcFoundedBy(tile.afc) !== rivalId) continue;
    const ownedByMe = tile.ownerId === me && tile.afc.ownerId === me;
    found.push({ x: tile.x, y: tile.y, ownedByMe, garrisoned: ownedByMe && tile.ownershipState === "SETTLED" && tile.afc.status === "active" });
  }
  // Ones the player holds first: they are what the Writ is about once it is taken.
  return found.sort((a, b) => Number(b.ownedByMe) - Number(a.ownedByMe)).slice(0, MAX_FOUND);
};

/** Explored AFCs the Writ's rival House founded; empty for any other charge. */
export const correctionAfcsInView = (charge: HouseChargeView, state: AfcState): CorrectionAfc[] => {
  const rivalId = correctionRivalId(charge);
  if (!rivalId) return [];
  const revision = state.tilesRevision;
  // No revision (tests, callers without one): scan without touching the cache.
  if (revision === undefined) return scan(state.tiles, rivalId, state.me);
  const key = cacheKey;
  if (!key || key.tiles !== state.tiles || key.revision !== revision || key.size !== state.tiles.size || key.me !== state.me) {
    cacheKey = { tiles: state.tiles, revision, size: state.tiles.size, me: state.me };
    cacheByRival.clear();
  }
  const cached = cacheByRival.get(rivalId);
  if (cached) return cached;
  const found = scan(state.tiles, rivalId, state.me);
  cacheByRival.set(rivalId, found);
  return found;
};

/** Where Show on map frames a Writ: the player's own rival-founded AFCs once it has any, else every one found. */
export const correctionFramePoints = (charge: HouseChargeView, state: AfcState): Array<{ x: number; y: number }> => {
  const found = correctionAfcsInView(charge, state);
  const owned = found.filter((afc) => afc.ownedByMe);
  return (owned.length > 0 ? owned : found).map(({ x, y }) => ({ x, y }));
};

/** Whether the Writ no longer needs its search circle: held, or an AFC its rival founded is in view. */
export const correctionSearchDone = (charge: HouseChargeView, state: AfcState): boolean =>
  charge.kind === "CORRECTION" && (charge.held || correctionAfcsInView(charge, state).length > 0);

/** The card's nudge while the player owns the rival's AFC but has not garrisoned it, so the Writ is not held yet. */
export const correctionGarrisonHint = (charge: HouseChargeView, state: AfcState): string | undefined => {
  if (charge.kind !== "CORRECTION" || charge.held) return undefined;
  return correctionAfcsInView(charge, state).some((afc) => afc.ownedByMe && !afc.garrisoned) ? "Taken: garrison it to hold" : undefined;
};
