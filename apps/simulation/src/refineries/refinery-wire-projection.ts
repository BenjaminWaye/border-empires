// The derived refinery status a viewer receives on a refinery's
// economic-structure JSON (docs/territory-development-plan.md, Phase 2;
// pattern: supportAnchor in docs/town-support-districts.md). Computed per
// viewer at the wire boundary from the live tiles; never persisted or cached.
//   owner:  refinery: { fieldX, fieldY, linked, processedTiles } | { unassigned: true }
//   others: refinery: { linked }  (and the stored refineryField is withheld)
import type { DomainTileState } from "@border-empires/game-domain";
import { evaluateRefineryAt, isRefineryType, refineryWireStatus, type RefineryWireStatus } from "@border-empires/shared";
import { refineryTownResolver } from "./refinery-slot-supply.js";

export type RefineryWireFields = { refinery?: RefineryWireStatus; withholdField: boolean };

export const refineryWireFields = (
  tiles: ReadonlyMap<string, DomainTileState>, tile: DomainTileState, viewerId: string | undefined
): RefineryWireFields => {
  const record = tile.economicStructure;
  if (!record || !isRefineryType(record.type)) return { withholdField: false };
  const evaluation = evaluateRefineryAt(tiles, tile, refineryTownResolver(tiles));
  const isOwner = viewerId !== undefined && viewerId === record.ownerId;
  return { ...(evaluation ? { refinery: refineryWireStatus(evaluation, isOwner) } : {}), withholdField: !isOwner };
};

/** The economic structure as the viewer should see it, with its derived refinery status. */
export const economicStructureForViewer = (
  tiles: ReadonlyMap<string, DomainTileState>, tile: DomainTileState, viewerId: string | undefined
): Record<string, unknown> | undefined => {
  if (!tile.economicStructure) return undefined;
  const { refinery, withholdField } = refineryWireFields(tiles, tile, viewerId);
  const { refineryField, ...rest } = tile.economicStructure;
  return { ...rest, ...(refineryField && !withholdField ? { refineryField } : {}), ...(refinery ? { refinery } : {}) };
};
