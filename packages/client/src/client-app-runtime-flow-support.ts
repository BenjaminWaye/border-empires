import { createClientInspectionFlow } from "./client-inspection-flow.js";
import { createClientOptimisticStateController } from "./client-optimistic-state.js";
import { createClientOriginSelection } from "./client-origin-selection.js";
import type { ClientAppDom } from "./client-app-runtime-dom.js";
import type { ClientState } from "./client-state.js";
import { createClientTechPanelFlow } from "./client-tech-panel-flow.js";
import type { StructureInfoKey, StructureInfoView } from "./client-map-display.js";
import type { Tile, TileVisibilityState } from "./client-types.js";

export const createClientRuntimeFlowSupport = (deps: {
  state: ClientState;
  dom: ClientAppDom;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  prettyToken: (value: string) => string;
  playerNameForOwner: (ownerId?: string | null) => string | undefined;
  terrainLabel: (x: number, y: number, terrain: Tile["terrain"]) => string;
  resourceLabel: (resource: string | undefined) => string;
  viewportSize: () => { width: number; height: number };
  isMobile: () => boolean;
  formatCooldownShort: (remainingMs: number) => string;
  structureInfoForKey: (type: StructureInfoKey) => StructureInfoView;
  structureInfoButtonHtml: (type: StructureInfoKey, label?: string) => string;
}) => {
  const {
    state,
    dom,
    keyFor,
    wrapX,
    wrapY,
    terrainAt,
    tileVisibilityStateAt,
    prettyToken,
    playerNameForOwner,
    terrainLabel,
    resourceLabel,
    viewportSize,
    isMobile,
    formatCooldownShort,
    structureInfoForKey,
    structureInfoButtonHtml
  } = deps;

  const optimistic = createClientOptimisticStateController({
    state,
    keyFor,
    terrainAt,
    tileVisibilityStateAt
  });

  const originSelection = createClientOriginSelection({
    state,
    keyFor,
    wrapX,
    wrapY
  });

  const inspectionFlow = createClientInspectionFlow({
    state,
    prettyToken,
    playerNameForOwner,
    terrainLabel,
    keyFor,
    terrainAt,
    resourceLabel
  });

  const techFlow = createClientTechPanelFlow({
    state,
    techPickEl: dom.techPickEl,
    mobileTechPickEl: dom.mobileTechPickEl,
    viewportSize,
    isMobile,
    formatCooldownShort,
    structureInfoForKey,
    structureInfoButtonHtml
  });

  return {
    optimistic,
    originSelection,
    inspectionFlow,
    techFlow
  };
};
