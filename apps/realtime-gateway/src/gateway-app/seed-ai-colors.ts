import { assignUniqueColor, RESERVED_COLORS } from "../player-color-allocation/player-color-allocation.js";

export async function seedAiColors(aiIds: ReadonlySet<string>, save: (id: string, color: string) => Promise<void>): Promise<void> {
  const taken = new Set<string>(RESERVED_COLORS);
  for (const id of [...aiIds].sort()) {
    const color = assignUniqueColor(id, taken);
    taken.add(color);
    await save(id, color);
  }
}
