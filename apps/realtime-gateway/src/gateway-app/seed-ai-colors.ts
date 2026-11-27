import { aiDisplayNameForId, isEmpireColorFarEnough } from "@border-empires/shared";
import { AI_COLOR_CANDIDATES, AI_EXTRA_COLOR_CANDIDATES, assignAiColors } from "../player-color-allocation/ai-color-assignment.js";
import { buildTakenColorSet, type TakenColorSetDeps } from "../player-color-allocation/build-taken-color-set.js";
import { RESERVED_COLORS, normalizeHex } from "../player-color-allocation/player-color-allocation.js";

const AI_CANDIDATE_SET = new Set<string>([...AI_COLOR_CANDIDATES, ...AI_EXTRA_COLOR_CANDIDATES]);

// Seeded AI empires get colours kept apart for colour-blind viewers too, with
// same-initial empires pushed furthest apart (see ai-color-assignment.ts), and
// at least MIN_EMPIRE_COLOR_DELTA_E from every active human empire in `taken`.
//
// Owner rule (2026-11-27): an empire's colour must not change mid-game. The
// gateway seeds on every boot, so an AI keeps the colour it already has
// (`storedColors`) whenever that colour is still a valid AI colour and far
// enough from the humans and the AIs kept before it. Only an AI with no
// stored colour, or one whose colour now clashes, is given a new one.
// Re-deriving every AI on boot repainted AIs on deploys: one changed input
// cascaded through the greedy sorted-order assignment.
export async function seedAiColors(
  aiIds: ReadonlySet<string>,
  save: (id: string, color: string) => Promise<void>,
  nameFor: (id: string) => string | undefined = aiDisplayNameForId,
  taken: ReadonlySet<string> = new Set(),
  storedColors: ReadonlyMap<string, string> = new Map()
): Promise<void> {
  const kept = new Map<string, string>();
  const occupied: string[] = [...taken];
  const needColor: string[] = [];
  for (const id of [...aiIds].sort()) {
    const stored = normalizeHex(storedColors.get(id) ?? "");
    const keep =
      stored !== null &&
      AI_CANDIDATE_SET.has(stored) &&
      !RESERVED_COLORS.has(stored) &&
      !occupied.includes(stored) &&
      isEmpireColorFarEnough(stored, occupied);
    if (keep) {
      kept.set(id, stored);
      occupied.push(stored);
    } else {
      needColor.push(id);
    }
  }
  const fresh = assignAiColors(needColor, nameFor, new Set(occupied));
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
