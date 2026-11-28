import { aiDisplayNameForId, defaultHouseCrestFor, isEmpireColorFarEnough } from "@border-empires/shared";
import { assignAiColors } from "../player-color-allocation/ai-color-assignment.js";
import { buildTakenColorSet, type TakenColorSetDeps } from "../player-color-allocation/build-taken-color-set.js";
import { RESERVED_COLORS, normalizeHex } from "../player-color-allocation/player-color-allocation.js";

// Seeded AI empires get colours kept apart for colour-blind viewers too, with
// empires sharing a crest pushed furthest apart (see ai-color-assignment.ts), and
// at least MIN_EMPIRE_COLOR_DELTA_E from every active human empire in `taken`.
//
// Owner rule (2026-11-27): an empire's colour must not change mid-game. The
// gateway seeds on every boot, so an AI keeps the colour it already has
// (`storedColors`). Only these get a new one:
//   - no stored colour, or one that is not a hex colour or is reserved;
//   - exactly the colour of a human or of an AI kept before it;
//   - too close (MIN_EMPIRE_COLOR_DELTA_E) to an AI kept before it, which
//     only happens to colours seeded before the distance rule existed. In a
//     crowded sector (more AIs than the colour space holds, so a fresh
//     assignment cannot keep them all apart either) this check is skipped,
//     or the late AIs would be repainted on every boot.
// Closeness to a human is not a reason: humans cannot pick near an active
// AI, and a human back after a long break must not repaint an AI the others
// have fought all season. Palette edits do not repaint either: any stored
// non-reserved colour is kept. Re-deriving every AI on boot (the old way)
// repainted AIs on deploys: one changed input cascaded through the greedy
// sorted-order assignment.
const allFarEnough = (colors: Iterable<string>): boolean => {
  const seen: string[] = [];
  for (const color of colors) {
    if (!isEmpireColorFarEnough(color, seen)) return false;
    seen.push(color);
  }
  return true;
};

export async function seedAiColors(
  aiIds: ReadonlySet<string>,
  save: (id: string, color: string) => Promise<void>,
  markFor: (id: string) => string | undefined = defaultHouseCrestFor,
  taken: ReadonlySet<string> = new Set(),
  storedColors: ReadonlyMap<string, string> = new Map()
): Promise<void> {
  const crowded = !allFarEnough(assignAiColors(aiIds, markFor, taken).values());
  const kept = new Map<string, string>();
  const keptInitials = new Map<string, string>();
  const needColor: string[] = [];
  for (const id of [...aiIds].sort()) {
    const stored = normalizeHex(storedColors.get(id) ?? "");
    const keep =
      stored !== null &&
      !RESERVED_COLORS.has(stored) &&
      !taken.has(stored) &&
      !keptInitials.has(stored) &&
      (crowded || isEmpireColorFarEnough(stored, keptInitials.keys()));
    if (keep) {
      kept.set(id, stored);
      keptInitials.set(stored, markFor(id) ?? "");
    } else {
      needColor.push(id);
    }
  }
  const fresh = assignAiColors(needColor, markFor, new Set([...taken, ...keptInitials.keys()]), keptInitials);
  for (const id of [...aiIds].sort()) {
    const color = kept.get(id) ?? fresh.get(id);
    if (color) await save(id, color);
  }
}

/** The AIs' stored colours, in one batched read (boot must not add a profile read per AI). */
export const storedAiColors = async (
  aiIds: ReadonlySet<string>,
  profileStore: { getMany: (playerIds: Iterable<string>) => Promise<Array<{ playerId: string; tileColor?: string }>> }
): Promise<Map<string, string>> => {
  const colors = new Map<string, string>();
  for (const profile of await profileStore.getMany(aiIds)) if (profile.tileColor) colors.set(profile.playerId, profile.tileColor);
  return colors;
};

/** Colours of the active human empires, which the AI seeding must keep away from. */
export const humanColorsForAiSeeding = async (aiIds: ReadonlySet<string>, deps: TakenColorSetDeps): Promise<Set<string>> => {
  const taken = await buildTakenColorSet("", deps);
  const colors = new Set<string>();
  for (const empire of taken.activeEmpires) {
    if (aiIds.has(empire.playerId) || aiDisplayNameForId(empire.playerId) || RESERVED_COLORS.has(empire.color)) continue;
    colors.add(empire.color);
  }
  return colors;
};
