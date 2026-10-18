export interface AfcStateStats {
  warEntries: number; wardEntries: number; warEvictions: number; wardEvictions: number;
  indexedFlags: number; cachedViews: number; indexLimitHits: number; viewLimitHits: number; cacheEvictions: number;
}
export const createAfcStateMetrics = () => {
  let values: AfcStateStats = { warEntries: 0, wardEntries: 0, warEvictions: 0, wardEvictions: 0, indexedFlags: 0, cachedViews: 0, indexLimitHits: 0, viewLimitHits: 0, cacheEvictions: 0 };
  return { set: (stats: AfcStateStats): void => { values = { ...stats }; }, snapshot: () => ({ simAfcState: { ...values } }) };
};
