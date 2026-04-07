import { createClientInspectionFlow } from "./client-inspection-flow.js";
import { createClientOptimisticStateController } from "./client-optimistic-state.js";
import { createClientOriginSelection } from "./client-origin-selection.js";
import { wasPredictedCombatAlreadyShown } from "./client-predicted-combat.js";
import { createClientTechPanelFlow } from "./client-tech-panel-flow.js";
import type { ClientAppEnv } from "./client-app-env.js";

export const createClientAppFlowDeps = (env: ClientAppEnv, renderDeps: Record<string, any>) => {
  const optimistic = createClientOptimisticStateController({
    state: env.state,
    keyFor: env.key,
    terrainAt: env.terrainAt,
    tileVisibilityStateAt: renderDeps.tileVisibilityStateAt
  });
  const originSelection = createClientOriginSelection({
    state: env.state,
    keyFor: env.key,
    wrapX: env.wrapX,
    wrapY: env.wrapY
  });
  const inspectionFlow = createClientInspectionFlow({
    state: env.state,
    prettyToken: env.prettyToken,
    playerNameForOwner: renderDeps.playerNameForOwner,
    terrainLabel: env.terrainLabel,
    populationPerMinuteLabel: renderDeps.populationPerMinuteLabel,
    isTileOwnedByAlly: renderDeps.isTileOwnedByAlly,
    hostileObservatoryProtectingTile: renderDeps.hostileObservatoryProtectingTile,
    pickOriginForTarget: originSelection.pickOriginForTarget,
    keyFor: env.key,
    terrainAt: env.terrainAt,
    resourceLabel: renderDeps.resourceLabel
  });
  const techFlow = createClientTechPanelFlow({
    state: env.state,
    techPickEl: env.dom.techPickEl,
    mobileTechPickEl: env.dom.mobileTechPickEl,
    viewportSize: renderDeps.viewportSize,
    isMobile: renderDeps.isMobile,
    formatCooldownShort: env.formatCooldownShort,
    structureInfoForKey: renderDeps.structureInfoForKey,
    structureInfoButtonHtml: renderDeps.structureInfoButtonHtml
  });

  return {
    ...optimistic,
    originSelection,
    ...originSelection,
    ...inspectionFlow,
    techFlow,
    wasPredictedCombatAlreadyShown,
    ...techFlow
  };
};
