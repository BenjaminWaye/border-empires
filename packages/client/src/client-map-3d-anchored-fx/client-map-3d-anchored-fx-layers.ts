import { Group, type Object3D, type Texture } from "three";
import { createAegisLockFxLayer } from "../client-map-3d-aegis-lock-fx/client-map-3d-aegis-lock-fx.js";
import { createAetherPurgeFxLayer } from "../client-map-3d-aether-purge-fx/client-map-3d-aether-purge-fx.js";
import { createAfcDropFxLayer } from "../client-map-3d-afc-drop-fx/client-map-3d-afc-drop-fx.js";
import { createAfcModuleDeliveryFxLayer } from "../client-map-3d-afc-module-delivery-fx.js";
import { createBombardFxLayer } from "../client-map-3d-bombard-fx/client-map-3d-bombard-fx.js";
import { createFloatingTextLayer } from "../client-map-3d-floating-text/client-map-3d-floating-text.js";
import { createMonumentPulseFxLayer } from "../client-map-3d-monument-pulse-fx/client-map-3d-monument-pulse-fx.js";
import { createRetortRecastFxLayer } from "../client-map-3d-retort-recast-fx/client-map-3d-retort-recast-fx.js";
import { createRevealEmpireFxLayer } from "../client-map-3d-reveal-empire-fx/client-map-3d-reveal-empire-fx.js";
import { createRevealEmpireStatsFxLayer } from "../client-map-3d-reveal-empire-stats-fx/client-map-3d-reveal-empire-stats-fx.js";
import { createSiphonFxLayer } from "../client-map-3d-siphon-fx/client-map-3d-siphon-fx.js";
import { createSurveySweepFxLayer } from "../client-map-3d-survey-sweep-fx/client-map-3d-survey-sweep-fx.js";
import { createUnsettleFxLayer } from "../client-map-3d-unsettle-fx/client-map-3d-unsettle-fx.js";
import { createAnchoredFxRoot, type AnchoredFxRoot } from "./client-map-3d-anchored-fx-root.js";

// The one place the 3D map creates its one-shot effect layers: every effect
// that is positioned once at spawn and then plays out over time must be
// created here, under the anchored fx root, so it stays on its world tile when
// the camera pans (see client-map-3d-anchored-fx-root.ts). A source-scan test
// (client-map-3d-anchored-fx-guard.test.ts) fails if client-map-3d.ts creates
// one of these layers against the raw scene. Layers rebuilt from tile
// coordinates on every rebuild or frame (tile overlays, survey-sweep pings,
// border dust) are not anchored and stay where they are.

export type AnchoredFxLayers = {
  readonly root: AnchoredFxRoot;
  readonly floatingText: ReturnType<typeof createFloatingTextLayer>;
  readonly aetherLanceFx: ReturnType<typeof createAetherPurgeFxLayer>;
  readonly surveySweepFx: ReturnType<typeof createSurveySweepFxLayer>;
  readonly siphonFx: ReturnType<typeof createSiphonFxLayer>;
  readonly retortRecastFx: ReturnType<typeof createRetortRecastFxLayer>;
  readonly revealEmpireFx: ReturnType<typeof createRevealEmpireFxLayer>;
  readonly revealEmpireStatsFx: ReturnType<typeof createRevealEmpireStatsFxLayer>;
  readonly bombardFx: ReturnType<typeof createBombardFxLayer>;
  /** Umbrite-purple, cosmetic siege-structure bombardment (client-siege-bombardment.ts). */
  readonly siegeBombardFx: ReturnType<typeof createBombardFxLayer>;
  readonly worldEngineStrikeFx: ReturnType<typeof createMonumentPulseFxLayer>;
  readonly imperialExchangeLevyFx: ReturnType<typeof createMonumentPulseFxLayer>;
  readonly astralDockLaunchFx: ReturnType<typeof createRevealEmpireFxLayer>;
  readonly aegisLockFx: ReturnType<typeof createAegisLockFxLayer>;
  readonly unsettleFx: ReturnType<typeof createUnsettleFxLayer>;
  readonly afcModuleDeliveryFx: ReturnType<typeof createAfcModuleDeliveryFxLayer>;
  readonly afcDropFx: ReturnType<typeof createAfcDropFxLayer>;
};

export const createAnchoredFxLayers = (scene: Object3D, buildingEnvironmentTexture: Texture | undefined): AnchoredFxLayers => {
  const root = createAnchoredFxRoot(scene);
  const anchored = <Layer extends { readonly group: Object3D }>(layer: Layer): Layer => {
    root.registerLayerGroup(layer.group);
    return layer;
  };
  // Floating text adds its sprites straight to its parent, so give it its own group to register.
  const floatingTextGroup = new Group();
  floatingTextGroup.name = "floating-text";
  root.group.add(floatingTextGroup);
  root.registerLayerGroup(floatingTextGroup);

  return {
    root,
    floatingText: createFloatingTextLayer(floatingTextGroup),
    aetherLanceFx: anchored(createAetherPurgeFxLayer(root.group)),
    surveySweepFx: anchored(createSurveySweepFxLayer(root.group)),
    siphonFx: anchored(createSiphonFxLayer(root.group)),
    retortRecastFx: anchored(createRetortRecastFxLayer(root.group)),
    revealEmpireFx: anchored(createRevealEmpireFxLayer(root.group)),
    revealEmpireStatsFx: anchored(createRevealEmpireStatsFxLayer(root.group)),
    bombardFx: anchored(createBombardFxLayer(root.group)),
    siegeBombardFx: anchored(createBombardFxLayer(root.group, { ring: "#7a3bff", flash: "#c79bff" })),
    worldEngineStrikeFx: anchored(createMonumentPulseFxLayer(root.group, "#ff5533", "world-engine-strike-fx")),
    imperialExchangeLevyFx: anchored(createMonumentPulseFxLayer(root.group, "#ffd166", "imperial-exchange-levy-fx")),
    astralDockLaunchFx: anchored(createRevealEmpireFxLayer(root.group)),
    aegisLockFx: anchored(createAegisLockFxLayer(root.group)),
    unsettleFx: anchored(createUnsettleFxLayer(root.group)),
    afcModuleDeliveryFx: anchored(createAfcModuleDeliveryFxLayer(root.group)),
    afcDropFx: anchored(createAfcDropFxLayer(root.group, buildingEnvironmentTexture))
  };
};
