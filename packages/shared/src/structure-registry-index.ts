import type { StructureSpec } from "./structure-registry/structure-registry.js";
import { FORT_SPECS } from "./structure-registry-fort.js";
import { OBSERVATORY_SPEC } from "./structure-registry-observatory.js";
import { RELAY_BEACON_SPEC, OUTPOST_SPECS } from "./structure-registry-outpost.js";
import { ECONOMIC_SPECS } from "./structure-registry-economic.js";

/**
 * Combined structure registry covering every buildable structure type.
 *
 * Sources:
 * - 4 fort variants (PALISADE, FORT, TITANIUM_BASTION, THUNDER_BASTION)
 * - 1 observatory (OBSERVATORY)
 * - 4 outpost variants (SIEGE_BATTERY, SIEGE_TOWER, DREAD_TOWER, RELAY_BEACON)
 * - the economic structures (every EconomicStructureType except PALISADE
 *   and RELAY_BEACON)
 */
export const STRUCTURE_REGISTRY: Record<string, StructureSpec> = {
  ...FORT_SPECS,
  OBSERVATORY: OBSERVATORY_SPEC,
  ...OUTPOST_SPECS,
  RELAY_BEACON: RELAY_BEACON_SPEC,
  ...ECONOMIC_SPECS,
};

export const STRUCTURE_REGISTRY_SIZE = Object.keys(STRUCTURE_REGISTRY).length;

/**
 * True for the siege ladder (SIEGE_BATTERY/SIEGE_TOWER/DREAD_TOWER) — the
 * only structures buildable directly on an owned FRONTIER tile, no SETTLE
 * step required first (see the OUT_OF_REACH/SETTLED gates in
 * runtime-structure-command-handlers.ts's handleBuildStructureCommand).
 * RELAY_BEACON is the one other OUTPOST-kind spec, but it still requires
 * SETTLED, so it's explicitly excluded here. Shared by the client's build
 * button (skip the settle-then-build chain) and the server's claim
 * continuation tail (skip the SETTLE step once ownership lands).
 */
export const structureSkipsSettledRequirement = (type: string): boolean => {
  const spec = STRUCTURE_REGISTRY[type];
  return spec?.kind === "OUTPOST" && type !== "RELAY_BEACON";
};

/**
 * True for the structures whose build an online client dispatches itself,
 * once the player has picked the exact tile in the placement overlay (see
 * client-structure-build-trigger.ts). The server can't dispatch these on the
 * player's behalf while they're online — it has no way to know which tile
 * they'll pick, and firing anyway would race the client's own build into a
 * BUILD_INVALID "tile already has structure". Shared by the client's
 * auto-build tick and the server's claim-continuation tail, which uses it to
 * decide whether a queued build is its own to drain (see
 * ServerDevQueueEntry.origin).
 */
export const structureRequiresClientPlacement = (type: string): boolean =>
  type === "ORE_REFINERY" || type === "HYDROWORKS";

/**
 * Which tech/domain build-speed effect shortens this structure's build, the
 * single rule both the simulation (stamping completesAt) and the client's
 * build menus use. Relay Beacon is an OUTPOST spec but has no speed lever;
 * Aether Tower (OBSERVATORY) has none either.
 */
export type StructureBuildSpeedEffectKey = "fortBuildSpeedMult" | "outpostDeploymentSpeedMult" | "economicStructureBuildSpeedMult";

export const structureBuildSpeedEffectKey = (structureType: string): StructureBuildSpeedEffectKey | undefined => {
  const kind = STRUCTURE_REGISTRY[structureType]?.kind;
  if (kind === "FORT") return "fortBuildSpeedMult";
  if (kind === "OUTPOST" && structureType !== "RELAY_BEACON") return "outpostDeploymentSpeedMult";
  if (kind === "ECONOMIC") return "economicStructureBuildSpeedMult";
  return undefined;
};

/** A base build duration shortened by a speed multiplier (1.5 = 50% faster). */
export const buildDurationWithSpeedMult = (baseMs: number, speedMult: number): number =>
  Math.max(1, Math.round(baseMs / speedMult));
