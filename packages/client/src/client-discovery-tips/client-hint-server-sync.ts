// Bridges the client-local hint/tutorial storage
// (client-discovery-tips-storage.ts, client-onboarding-checklist-storage.ts,
// both still localStorage-backed for instant reads) to the gateway's
// server-persisted copy (SET_HINT_STATE / HINT_STATE_SET in messages.ts,
// player-profile-store.ts's dismissedHints/hintsMuted/onboardingChecklistCompleted).
// localStorage stays the source of truth for instant, synchronous reads;
// this just keeps the server copy in sync so state survives a browser data
// clear or a different device instead of only living in one browser.

import { hydrateDiscoveryTipsFromServer } from "./client-discovery-tips-storage.js";
import { hydrateOnboardingChecklistFromServer } from "../client-onboarding-checklist/client-onboarding-checklist-storage.js";

type HintStatePatch = { dismissedHints?: string[]; hintsMuted?: boolean; onboardingChecklistCompleted?: boolean };

let sendHintStateMessage: ((patch: HintStatePatch) => void) | undefined;

/** Called once from client-network.ts wiring with the real WebSocket send function. */
export const registerHintStateSender = (send: (patch: HintStatePatch) => void): void => {
  sendHintStateMessage = send;
};

/** Called by the storage modules whenever a hint is dismissed/muted/completed locally. No-ops until a sender is registered (e.g. before the socket connects) -- the next local write after connecting will resync. */
export const sendHintStateUpdate = (patch: HintStatePatch): void => {
  sendHintStateMessage?.(patch);
};

/** Handles the gateway's HINT_STATE_SET ack, reconciling server state into local storage. */
export const applyHintStateSetMessage = (msg: Record<string, unknown>, authEmail: string | null | undefined): void => {
  hydrateDiscoveryTipsFromServer((msg.dismissedHints as string[] | undefined) ?? [], Boolean(msg.hintsMuted), authEmail);
  hydrateOnboardingChecklistFromServer(Boolean(msg.onboardingChecklistCompleted), authEmail);
};
