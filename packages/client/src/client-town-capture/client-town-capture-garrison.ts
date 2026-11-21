// The capture card's "Garrison now" button. A captured town lands as your FRONTIER and gives no coin or
// manpower until it is garrisoned, which players missed (2026-11-21 playtest). The card lives outside the
// action flow, so the action flow registers its town Garrison (town + support ring) here once at boot.
import type { ClientState } from "../client-state/client-state.js";

type GarrisonAt = (x: number, y: number) => boolean;

/** What the capture card offers: a button, or a note that the "towns" auto-garrison pref will handle it. */
export type TownCaptureGarrisonOffer = { kind: "manual"; garrison: () => boolean } | { kind: "auto" };

let registered: { state: Pick<ClientState, "autoSettle">; garrisonAt: GarrisonAt } | undefined;

/** Called by the action flow with its town Garrison; returns it unchanged so the call can wrap the definition. */
export const registerTownCaptureGarrison = (state: Pick<ClientState, "autoSettle">, garrisonAt: GarrisonAt): GarrisonAt => {
  registered = { state, garrisonAt };
  return garrisonAt;
};

export const townCaptureGarrisonOffer = (x: number, y: number): TownCaptureGarrisonOffer | undefined => {
  if (!registered) return undefined;
  const { state, garrisonAt } = registered;
  if (state.autoSettle.status === "loaded" && state.autoSettle.prefs.towns) return { kind: "auto" };
  return { kind: "manual", garrison: () => garrisonAt(x, y) };
};

/** Test-only reset. */
export const resetTownCaptureGarrisonForTest = (): void => {
  registered = undefined;
};
