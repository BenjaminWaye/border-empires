// Marks the Manifest the guide wants the player to commission first
// (RECOMMENDED_FIRST_MANIFEST_ID) wherever the Manifest tree is on screen:
// the new HUD's Manifest screen (client-hud-v2-manifest.ts nodes) and the
// legacy tech panel's tree (client-tech-tree-html.ts cards). The marking
// itself lives in tutorial-guide-pick-marker.ts.

import { createGuidePickMarker } from "./tutorial-guide-pick-marker.js";

/** The tree nodes for `techId` in both Manifest trees (not the small "Leads to" / owned-list links that share data-tech-card). */
export const guideManifestPickSelector = (techId: string): string => `.v2m-node[data-v2-manifest-select="${techId}"], .tech-card[data-tech-card="${techId}"]`;

const syncMarker = createGuidePickMarker("manifest");

/** Marks the nodes for `techId` (or clears every mark when undefined). Call each frame; cheap when nothing changed. */
export const syncGuideManifestPick = (techId: string | undefined, root?: ParentNode): void => {
  syncMarker(techId ? guideManifestPickSelector(techId) : undefined, root);
};
