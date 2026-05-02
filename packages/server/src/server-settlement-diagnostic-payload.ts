export type SettlementRepairDiagnostic = { key: string; detail: string };

export const withSettlementRepairDiagnostic = <TPayload extends Record<string, unknown>>(
  payload: TPayload,
  settlementRepairDiagnostic: SettlementRepairDiagnostic | undefined
): TPayload & { settlementRepairDiagnostic?: SettlementRepairDiagnostic } =>
  settlementRepairDiagnostic ? { ...payload, settlementRepairDiagnostic } : payload;
