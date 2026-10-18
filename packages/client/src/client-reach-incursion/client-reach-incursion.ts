import { normalizeColorForThree } from "../client-three-color/client-three-color.js";

// "Incursion" tiles: rival-owned land sitting INSIDE the viewer's own reach.
// Capturing plain tiles by ATTACK never moves reach borders (only TOWN/
// OUTPOST/DOCK anchors grant reach), so a rival that breaks in holds tiles
// that are still enclosed by the viewer's bright reach border -- visually
// "inside my empire". Both renderers mark these tiles (a two-colour hatch of
// the intruder's colour and the viewer's + a crisp edge around each pocket) so they can't be
// mistaken for the viewer's own ground. Pure logic shared by the 3D overlay
// (client-map-3d-incursion-overlay.ts) and the 2D canvas path.

export type IncursionTile = { readonly ownerId?: string | undefined; readonly terrain?: string | undefined; readonly reachOwnerId?: string | undefined };

export type IncursionDeps = {
  readonly tiles: ReadonlyMap<string, IncursionTile>;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

/** Which sides of an incursion tile face ground NOT held by the same intruder -- i.e. where the pocket's edge runs. */
export type IncursionEdges = { readonly north: boolean; readonly east: boolean; readonly south: boolean; readonly west: boolean };

/**
 * The intruding owner at this tile, or undefined when it isn't an incursion:
 * the tile must be owned by someone other than the viewer (barbarians are
 * environment, not an empire, and are excluded) and sit inside the viewer's
 * reach set.
 */
export const incursionOwnerAt = (
  tile: IncursionTile | undefined,
  tileKey: string,
  me: string | undefined,
  myReach: ReadonlySet<string> | undefined
): string | undefined => {
  const ownerId = tile?.ownerId;
  if (!ownerId || !me || ownerId === me || ownerId.startsWith("barbarian")) return undefined;
  return myReach?.has(tileKey) ? ownerId : undefined;
};

/**
 * The mirror of an incursion: the rival whose reach covers one of the
 * viewer's OWN tiles (land the viewer took by attack, which never moves a
 * reach border), or undefined. Read straight off the server's contest-resolved
 * tile.reachOwnerId. These tiles can't host the viewer's Relay Beacon, so both
 * renderers mark them exactly like an incursion with the roles swapped (see
 * reachPocketAt): the viewer is the one who pushed in.
 */
export const rivalReachOverMyTile = (tile: IncursionTile | undefined, me: string | undefined): string | undefined => {
  const reachOwnerId = tile?.reachOwnerId;
  if (!me || tile?.ownerId !== me || !reachOwnerId || reachOwnerId === me || reachOwnerId.startsWith("barbarian")) return undefined;
  return reachOwnerId;
};

/**
 * A tile held by one empire inside another's reach, from either side: a
 * rival's tile inside the viewer's reach (incursionOwnerAt) or the viewer's
 * own tile inside a rival's reach (rivalReachOverMyTile). `pusher` holds the
 * tile, `defender` owns the reach around it, and `inDefenderReach` says
 * whether any tile key sits inside that reach. Both cases get the same hatch
 * and front line, coloured by who pushed in.
 */
export type ReachPocket = {
  readonly pusher: string;
  readonly defender: string;
  readonly inDefenderReach: Pick<ReadonlySet<string>, "has">;
};

export const reachPocketAt = (
  tile: IncursionTile | undefined,
  tileKey: string,
  me: string,
  myReach: ReadonlySet<string>,
  tiles: ReadonlyMap<string, IncursionTile>
): ReachPocket | undefined => {
  const intruder = incursionOwnerAt(tile, tileKey, me, myReach);
  if (intruder) return { pusher: intruder, defender: me, inDefenderReach: myReach };
  const rival = rivalReachOverMyTile(tile, me);
  if (!rival) return undefined;
  return { pusher: me, defender: rival, inDefenderReach: { has: (key) => tiles.get(key)?.reachOwnerId === rival } };
};

export const incursionPocketEdges = (x: number, y: number, ownerId: string, deps: IncursionDeps): IncursionEdges => {
  const heldBySameIntruder = (nx: number, ny: number): boolean =>
    deps.tiles.get(deps.keyFor(deps.wrapX(nx), deps.wrapY(ny)))?.ownerId === ownerId;
  return {
    north: !heldBySameIntruder(x, y - 1),
    east: !heldBySameIntruder(x + 1, y),
    south: !heldBySameIntruder(x, y + 1),
    west: !heldBySameIntruder(x - 1, y)
  };
};

/**
 * Classifier for the breach outline (client-incursion-breach-layout.ts): what
 * sits at offset (dx, dy) from the incursion tile at (x, y) -- more of the same
 * intruder's pocket (inside my reach), the intruder's own land behind the old
 * border (outside it), the viewer's own land, or anything else. For the
 * mirror case pass the viewer as `ownerId`, the rival as `me` and the rival's
 * reach as `myReach` (ReachPocket's pusher / defender / inDefenderReach).
 */
export const incursionNeighbourKindAt =
  (x: number, y: number, ownerId: string, me: string, deps: IncursionDeps, myReach: Pick<ReadonlySet<string>, "has">) =>
  (dx: number, dy: number): "pocket" | "rival" | "mine" | "other" => {
    const key = deps.keyFor(deps.wrapX(x + dx), deps.wrapY(y + dy));
    const neighbourOwner = deps.tiles.get(key)?.ownerId;
    // The intruder's own land outside my reach is behind the old border, not part of the incursion pocket.
    if (neighbourOwner === ownerId) return myReach.has(key) ? "pocket" : "rival";
    return neighbourOwner === me ? "mine" : "other";
  };

const LIGHT_MARK = "#ffffff";
const DARK_MARK = "#141414";
/** Relative-luminance cutoff above which the intruder colour is "light" and gets dark marks. */
const LIGHT_FILL_LUMINANCE = 0.45;

/**
 * Colour for the pocket edge. It sits on top of the intruder's OWN tile fill,
 * so drawing it in the intruder's colour makes it invisible -- instead use
 * white over a dark fill and near-black over a light one, so it reads on any
 * player colour.
 */
export const incursionMarkColor = (intruderColor: string): string => {
  const hex = normalizeColorForThree(intruderColor);
  const channel = (offset: number): number => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > LIGHT_FILL_LUMINANCE ? DARK_MARK : LIGHT_MARK;
};

/** Below this RGB distance (0..sqrt(3)) the two hatch colours are treated as too close to tell apart. */
const MIN_HATCH_COLOR_DISTANCE = 0.35;
const TOO_CLOSE_LIGHTEN = 0.45;

const hexToRgb = (color: string): [number, number, number] => {
  const hex = normalizeColorForThree(color);
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
};
const rgbToHex = (rgb: readonly number[]): string =>
  `#${rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("")}`;

/**
 * Two-colour hatch for an incursion tile: stripes alternate between the
 * intruder's colour and the viewer's own, reading as "their ground, inside
 * my reach". When the two are too close to tell apart (both greys, or a pair
 * colour spacing couldn't separate), the viewer's stripe is lightened.
 */
export const incursionHatchColors = (intruderColor: string, myColor: string): { readonly theirs: string; readonly mine: string } => {
  const theirs = hexToRgb(intruderColor);
  const mine = hexToRgb(myColor);
  const distance = Math.hypot(theirs[0] - mine[0], theirs[1] - mine[1], theirs[2] - mine[2]);
  const mineOut = distance >= MIN_HATCH_COLOR_DISTANCE ? mine : mine.map((c) => c + (1 - c) * TOO_CLOSE_LIGHTEN);
  return { theirs: rgbToHex(theirs), mine: rgbToHex(mineOut) };
};
