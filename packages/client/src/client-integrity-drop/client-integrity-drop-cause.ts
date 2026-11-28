// Why Empire Integrity fell between two server updates, and what fixes it.
// Integrity (packages/shared empireIntegrity) has two parts: the shape of all
// owned land (open sides against the fewest an empire that size could have)
// and a penalty for holding under INTEGRITY_MIN_GARRISON_SHARE garrisoned.
// The server sends the inputs (T owned, Ts garrisoned, Es open sides) with
// every full PLAYER_UPDATE, so the part that moved names the cause; the tile
// map then says where (a hole, a thin line, or the weakest new open side).

import { INTEGRITY_MIN_GARRISON_SHARE, integrityParts } from "@border-empires/shared";
import { compassFrom, type IntegrityShapeScan, type IntegrityShapeSpot } from "./client-integrity-shape.js";

/** The server's integrity inputs at one update. */
export type IntegritySnapshot = {
  readonly pct: number;
  readonly owned: number;
  readonly garrisoned: number;
  readonly openSides: number;
};

export type IntegrityDropKind = "garrison" | "hole" | "thin_line" | "open_sides";

export type IntegrityDropNotice = {
  readonly fromPct: number;
  readonly toPct: number;
  readonly kind: IntegrityDropKind;
  /** e.g. "3 new tiles not garrisoned", "Hole at (12, 40)". */
  readonly cause: string;
  /** e.g. "Garrison 3 tiles", "Take the hole". */
  readonly fix: string;
  /** The tile the cause points at, when there is one. */
  readonly focus?: { readonly x: number; readonly y: number };
  readonly at: number;
};

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Garrisons still needed to reach the INTEGRITY_MIN_GARRISON_SHARE floor. */
export const garrisonsNeededForFloor = (owned: number, garrisoned: number): number =>
  Math.max(0, Math.ceil(owned * INTEGRITY_MIN_GARRISON_SHARE - 1e-9) - garrisoned);

const garrisonCause = (before: IntegritySnapshot, after: IntegritySnapshot): string => {
  const newLand = after.owned - before.owned;
  const newGarrisons = after.garrisoned - before.garrisoned;
  if (newGarrisons < 0) return `${plural(-newGarrisons, "garrisoned tile")} lost`;
  const ungarrisoned = newLand - newGarrisons;
  if (ungarrisoned > 0) return `${plural(ungarrisoned, "new tile")} not garrisoned`;
  const share = after.owned > 0 ? Math.round((after.garrisoned / after.owned) * 100) : 0;
  return `Only ${share}% garrisoned`;
};

const newSpot = (spots: readonly IntegrityShapeSpot[], baseline: ReadonlySet<string> | undefined): IntegrityShapeSpot | undefined =>
  spots.find((spot) => !baseline?.has(spot.key)) ?? spots[0];

/**
 * The notice for a drop from `before` to `after`. `scan` is the tile map now; `baselineKeys` the hole and thin-line
 * keys at `before`, so a spot that appeared since is named ahead of one that was already there.
 */
export const integrityDropNotice = (
  before: IntegritySnapshot,
  after: IntegritySnapshot,
  scan: IntegrityShapeScan,
  baselineKeys: ReadonlySet<string> | undefined,
  at: number
): IntegrityDropNotice => {
  const head = { fromPct: Math.round(before.pct), toPct: Math.round(after.pct), at };
  const was = integrityParts(before.owned, before.openSides, before.garrisoned);
  const now = integrityParts(after.owned, after.openSides, after.garrisoned);
  const penaltyRise = now.garrisonPenalty - was.garrisonPenalty;
  const shapeDrop = was.shape - now.shape;
  if (penaltyRise > 0 && penaltyRise >= shapeDrop) {
    const needed = Math.max(1, garrisonsNeededForFloor(after.owned, after.garrisoned));
    return { ...head, kind: "garrison", cause: garrisonCause(before, after), fix: `Garrison ${plural(needed, "tile")}` };
  }
  const lost = before.owned - after.owned;
  const lostPrefix = lost > 0 ? `${plural(lost, "tile")} lost · ` : "";
  const hole = newSpot(scan.holes, baselineKeys);
  if (hole) {
    return { ...head, kind: "hole", cause: `${lostPrefix}Hole at (${hole.x}, ${hole.y})`, fix: "Take the hole", focus: { x: hole.x, y: hole.y } };
  }
  const thin = newSpot(scan.thinLines, baselineKeys);
  if (thin) {
    const where = compassFrom(scan.centre, thin.x, thin.y);
    const place = where === "middle" ? "in the middle" : thin.coastal ? `along the ${where} coast` : `in the ${where}`;
    return { ...head, kind: "thin_line", cause: `${lostPrefix}Thin line ${place}`, fix: "Fill in behind it", focus: { x: thin.x, y: thin.y } };
  }
  const added = after.openSides - before.openSides;
  const cause = added > 0 ? `${lostPrefix}+${plural(added, "open side")}` : lost > 0 ? `${plural(lost, "tile")} lost` : "Shape got less compact";
  return { ...head, kind: "open_sides", cause, fix: "Grow in fat chunks" };
};
