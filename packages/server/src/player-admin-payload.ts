import type { EmpireVisualStyle } from "@border-empires/shared";

export type AdminPlayerListEntry = {
  id: string;
  name: string;
  isAi: boolean;
  rawTileColor?: string;
  effectiveTileColor: string;
  visualStyle: EmpireVisualStyle;
  shieldUntil: number;
  territoryTiles: number;
  settledTiles: number;
  frontierTiles: number;
};

export type AdminPlayerListPayload = {
  ok: true;
  at: number;
  players: AdminPlayerListEntry[];
};

export const buildAdminPlayerListPayload = (
  entries: Iterable<AdminPlayerListEntry>,
  at: number
): AdminPlayerListPayload => ({
  ok: true,
  at,
  players: [...entries].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
});
