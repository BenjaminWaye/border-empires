export interface AfcStateStats {
  aiRecoverySearches?: number; pendingDeliveries?: number; globalLosses?: number;
  wardEntries: number; wardEvictions: number; activeHijacks: number;
}
export const createAfcStateMetrics = () => {
  let values: AfcStateStats = { wardEntries: 0, wardEvictions: 0, activeHijacks: 0 };
  return { set: (stats: AfcStateStats): void => { values = { ...stats }; }, snapshot: () => ({ simAfcState: { ...values } }) };
};
