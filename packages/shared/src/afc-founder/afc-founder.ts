// Which House founded an AFC: the House that landed or built it, kept through
// every capture (TileAfcState.foundedBy). A Writ of Correction charge
// (docs/house-charges-plan.md) counts AFCs by founder, and the tile
// description names it.
//
// AFCs saved before foundedBy existed have no field. One never captured is
// still its founder's; one already captured lost that record, so its founder
// is unknown (undefined) and it never counts for a Correction.
export type AfcFounderFields = { readonly ownerId: string; readonly capturedAt?: number | undefined; readonly foundedBy?: string | undefined };

export const afcFoundedBy = (afc: AfcFounderFields | undefined): string | undefined => {
  if (!afc) return undefined;
  return afc.foundedBy ?? (afc.capturedAt === undefined ? afc.ownerId : undefined);
};
