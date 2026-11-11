import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { isChosenStructureTier } from "@border-empires/shared";

// ── Unified build handler (Phase 2) ──────────────────────────────
// Maps the legacy per-structure BUILD_* commands onto BUILD_STRUCTURE.
// Extracted verbatim from runtime.ts (over the file-line cap).
export const normalizeLegacyBuildCommand = (command: CommandEnvelope): CommandEnvelope => {
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(command.payloadJson) as Record<string, unknown>; }
  catch { /* TODO: emit counter command_legacy_normalize_parse_error{type} */ return command; }
  let structureType: string;
  if (command.type === "BUILD_FORT") structureType = "FORT";
  else if (command.type === "BUILD_OBSERVATORY") structureType = "OBSERVATORY";
  else if (command.type === "BUILD_SIEGE_BATTERY") structureType = "SIEGE_BATTERY";
  else if (command.type === "BUILD_ECONOMIC_STRUCTURE") structureType = payload.structureType as string;
  else structureType = command.type;
  return {
    ...command,
    type: "BUILD_STRUCTURE",
    // The Fortify / Siege picker's explicit tier rides along; the build handler validates it.
    payloadJson: JSON.stringify({ x: payload.x, y: payload.y, structureType, ...(isChosenStructureTier(payload.tier) ? { tier: payload.tier } : {}) })
  } as unknown as CommandEnvelope;
};
