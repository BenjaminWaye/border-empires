import { aiDisplayNameForId } from "@border-empires/shared";
import { assignAiColors } from "../player-color-allocation/ai-color-assignment.js";

// Seeded AI empires get colours kept apart for colour-blind viewers too, with
// same-initial empires pushed furthest apart (see ai-color-assignment.ts).
export async function seedAiColors(
  aiIds: ReadonlySet<string>,
  save: (id: string, color: string) => Promise<void>,
  nameFor: (id: string) => string | undefined = aiDisplayNameForId
): Promise<void> {
  for (const [id, color] of assignAiColors(aiIds, nameFor)) {
    await save(id, color);
  }
}
