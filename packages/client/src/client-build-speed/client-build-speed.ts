// Build menus show what a build will actually take: the base time (1s per
// manpower point) shortened by the player's tech/domain build-speed effects,
// using the same structure -> effect rule and formula the simulation uses to
// stamp completesAt (structureBuildSpeedEffectKey / buildDurationWithSpeedMult
// in shared, multiplicativeEffectForPlayer in apps/simulation).
import {
  buildDurationWithSpeedMult,
  economicStructureBuildDurationMs,
  fortBuildDurationMs,
  siegeBatteryBuildDurationMs,
  structureBuildSpeedEffectKey,
  type EconomicStructureType,
  type FortVariant,
  type SiegeBatteryVariant,
  type StructureBuildSpeedEffectKey
} from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

export type BuildSpeedState = Pick<ClientState, "techIds" | "domainIds" | "techCatalog" | "domainCatalog">;

const effectMult = (effects: Record<string, unknown> | undefined, key: StructureBuildSpeedEffectKey): number => {
  const value = effects?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
};

export const buildSpeedMultForState = (state: BuildSpeedState, key: StructureBuildSpeedEffectKey): number => {
  const techIds = new Set(state.techIds);
  const domainIds = new Set(state.domainIds);
  let mult = 1;
  for (const tech of state.techCatalog) if (techIds.has(tech.id)) mult *= effectMult(tech.effects, key);
  for (const domain of state.domainCatalog) if (domainIds.has(domain.id)) mult *= effectMult(domain.effects, key);
  return mult;
};

/** `baseMs` for `structureType` after the player's build-speed effects; instant stays instant. */
export const buildMsWithSpeedForState = (state: BuildSpeedState, structureType: string, baseMs: number): number => {
  const key = structureBuildSpeedEffectKey(structureType);
  if (!key || baseMs <= 0) return baseMs;
  return buildDurationWithSpeedMult(baseMs, buildSpeedMultForState(state, key));
};

export const economicBuildMsForState = (state: BuildSpeedState, type: EconomicStructureType): number =>
  buildMsWithSpeedForState(state, type, economicStructureBuildDurationMs(type));

export const fortBuildMsForState = (state: BuildSpeedState, variant: FortVariant): number =>
  buildMsWithSpeedForState(state, variant, fortBuildDurationMs(variant));

export const siegeBuildMsForState = (state: BuildSpeedState, variant: SiegeBatteryVariant): number =>
  buildMsWithSpeedForState(state, variant, siegeBatteryBuildDurationMs(variant));
