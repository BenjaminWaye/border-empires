import { activeFullscreenCard, queuedFullscreenCardCount } from "../client-fullscreen-card-queue/client-fullscreen-card-queue.js";
import { isWaystationActivationPopupPending } from "../client-waystation-activation/client-waystation-activation-gate.js";

/**
 * True while a full-screen reward card is on screen, queued, or waiting for
 * What's New to close: the map behind it is hidden, so a waystation opening
 * holds at its first frame until the player can actually watch it.
 */
export const isMapCoveredByRewardCard = (): boolean =>
  activeFullscreenCard() !== undefined || queuedFullscreenCardCount() > 0 || isWaystationActivationPopupPending();
