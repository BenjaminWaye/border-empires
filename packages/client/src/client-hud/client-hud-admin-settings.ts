// Bindings for Settings > Admin (map reveal + the lighting tuner). Split out
// of client-hud.ts, which is already over the repo's per-file line cap and
// must not grow (AGENTS.md), so the HUD only needs one call.
import { fogRevealLog } from "../client-debug/client-debug.js";
import { bindLightingTunerControls } from "../client-lighting-tuner/client-lighting-tuner-ui.js";
import { mapRevealAvailable, setMapRevealEnabled } from "../client-map-reveal/client-map-reveal.js";
import type { ClientState } from "../client-state/client-state.js";

export type AdminSettingsDeps = {
  readonly state: Pick<
    ClientState,
    "mapRevealEligible" | "authSessionReady" | "mapRevealEnabled" | "fogDisabled" | "authEmail" | "connection"
  >;
  readonly sendGameMessage: (payload: unknown, message?: string) => boolean;
  readonly requestViewRefresh: (priorityBoost?: number, immediate?: boolean) => void;
  readonly rerender: () => void;
};

export const bindAdminSettingsControls = (root: ParentNode, deps: AdminSettingsDeps): void => {
  const { state, sendGameMessage, requestViewRefresh, rerender } = deps;
  (root.querySelectorAll("[data-map-reveal]") as NodeListOf<HTMLButtonElement>).forEach((mapRevealBtn) => {
    mapRevealBtn.onclick = () => {
      if (!mapRevealAvailable({ enabledForAccount: state.mapRevealEligible && state.authSessionReady })) return;
      const nextEnabled = !state.mapRevealEnabled;
      state.mapRevealEnabled = nextEnabled;
      setMapRevealEnabled(nextEnabled, {
        enabledForAccount: state.mapRevealEligible && state.authSessionReady,
        authEmail: state.authEmail
      });
      fogRevealLog("button-click", {
        nextEnabled,
        authSessionReady: state.authSessionReady,
        eligible: state.mapRevealEligible,
        connection: state.connection,
        fogDisabled: state.fogDisabled
      });
      sendGameMessage(
        nextEnabled ? { type: "REQUEST_REVEAL_MAP" } : { type: "SET_FOG_DISABLED", disabled: false },
        "Finish signing in before changing the map reveal."
      );
      requestViewRefresh(2, true);
      rerender();
    };
  });
  bindLightingTunerControls(root, rerender);
};
