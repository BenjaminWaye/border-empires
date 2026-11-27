import { z } from "zod";
import { TOWN_FOCUS_MAX_TILES_PER_COMMAND, TownFocusSchema } from "./town-focus.js";

// SET_TOWN_FOCUS: queue one focus for a list of the sender's towns. Free; the
// list is bounded and the simulation skips towns the sender does not own.
export const SetTownFocusMessageSchema = z.object({
  type: z.literal("SET_TOWN_FOCUS"),
  tiles: z.array(z.object({ x: z.number().int(), y: z.number().int() })).min(1).max(TOWN_FOCUS_MAX_TILES_PER_COMMAND),
  focus: TownFocusSchema,
  commandId: z.string().min(1).optional(),
  clientSeq: z.number().int().positive().optional()
});
