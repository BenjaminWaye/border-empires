import { TERRITORY_AUTO_COMMAND_PREFIX } from "../runtime-types.js";

export type TerritoryAutomationCommandIdGenerator = (label: string, playerId: string, tileKey: string, nowMs: number) => string;

/** Mints unique `territory-auto:` command ids; the counter keeps ids distinct within the same millisecond. */
export const createTerritoryAutomationCommandIdGenerator = (): TerritoryAutomationCommandIdGenerator => {
  let counter = 0;
  return (label, playerId, tileKey, nowMs) => {
    counter += 1;
    return `${TERRITORY_AUTO_COMMAND_PREFIX}${label}:${playerId}:${tileKey}:${nowMs}:${counter}`;
  };
};
