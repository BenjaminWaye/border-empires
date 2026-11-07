import { emitVisibilityAuditForRuntime, type RuntimeVisibleStateContext } from "./runtime-visibility.js";

type VisibleStateContextDeps = Omit<RuntimeVisibleStateContext, "emitVisibilityAudit"> &
  Pick<Parameters<typeof emitVisibilityAuditForRuntime>[0], "onVisibilityAudit">;

/** Owns the visibility-audit adapter used by both sync and async exports. */
export function createVisibleStateContext(deps: VisibleStateContextDeps): RuntimeVisibleStateContext {
  const { onVisibilityAudit, ...context } = deps;
  return {
    ...context,
    emitVisibilityAudit: (playerId, tile, tileKey, redacted, classification) =>
      emitVisibilityAuditForRuntime({ onVisibilityAudit, playerId, tile, tileKey, redacted, classification })
  };
}
