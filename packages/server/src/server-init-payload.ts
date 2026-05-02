import { withSettlementRepairDiagnostic, type SettlementRepairDiagnostic } from "./server-settlement-diagnostic-payload.js";

export const buildServerInitPayload = <TPayload extends Record<string, unknown>>(
  payload: TPayload,
  settlementRepairDiagnostic: SettlementRepairDiagnostic | undefined
): TPayload & { type: "INIT"; settlementRepairDiagnostic?: SettlementRepairDiagnostic } =>
  withSettlementRepairDiagnostic(payload, settlementRepairDiagnostic) as TPayload & {
    type: "INIT";
    settlementRepairDiagnostic?: SettlementRepairDiagnostic;
  };
