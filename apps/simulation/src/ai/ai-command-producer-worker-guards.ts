import type { CommandEnvelope } from "@border-empires/sim-protocol";

export const isAutomationPreplanCommand = (type: CommandEnvelope["type"]): boolean => type === "CHOOSE_TECH" || type === "CHOOSE_DOMAIN";
export const isExpandAction = (type: CommandEnvelope["type"]): boolean => type === "EXPAND" || type === "ATTACK";
export const isBuildAction = (type: CommandEnvelope["type"]): boolean =>
  type === "BUILD_FORT" || type === "BUILD_OBSERVATORY" || type === "BUILD_SIEGE_OUTPOST" ||
  type === "BUILD_ECONOMIC_STRUCTURE" || type === "CANCEL_FORT_BUILD" || type === "CANCEL_STRUCTURE_BUILD" ||
  type === "CANCEL_SIEGE_OUTPOST_BUILD";
