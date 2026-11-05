// Marks the AFC upgrade the guide recommends (RECOMMENDED_FIRST_AFC_UPGRADE_ID,
// the Founding Concession) on its card in the AFC Upgrades panel
// (client-afc-upgrades.ts), on both the desktop panel and the mobile one.

import { createGuidePickMarker } from "./tutorial-guide-pick-marker.js";

export const guideAfcPickSelector = (upgradeId: string): string => `.afc-upgrade-card[data-afc-upgrade-card="${upgradeId}"]`;

const syncMarker = createGuidePickMarker("afc");

/** Marks the card for `upgradeId` (or clears the mark when undefined). Call each frame. */
export const syncGuideAfcPick = (upgradeId: string | undefined, root?: ParentNode): void => {
  syncMarker(upgradeId ? guideAfcPickSelector(upgradeId) : undefined, root);
};
