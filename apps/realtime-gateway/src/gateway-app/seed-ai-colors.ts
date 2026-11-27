import { aiDisplayNameForId } from "@border-empires/shared";
import { assignAiColors } from "../player-color-allocation/ai-color-assignment.js";
import { buildTakenColorSet, type TakenColorSetDeps } from "../player-color-allocation/build-taken-color-set.js";
import { RESERVED_COLORS } from "../player-color-allocation/player-color-allocation.js";

// Seeded AI empires get colours kept apart for colour-blind viewers too, with
// same-initial empires pushed furthest apart (see ai-color-assignment.ts), and
// at least MIN_EMPIRE_COLOR_DELTA_E from every active human empire in `taken`.
// AI colours are re-derived on every boot, so an AI never keeps a colour that
// a human has since picked close to.
export async function seedAiColors(
  aiIds: ReadonlySet<string>,
  save: (id: string, color: string) => Promise<void>,
  nameFor: (id: string) => string | undefined = aiDisplayNameForId,
  taken: ReadonlySet<string> = new Set()
): Promise<void> {
  for (const [id, color] of assignAiColors(aiIds, nameFor, taken)) {
    await save(id, color);
  }
}

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
