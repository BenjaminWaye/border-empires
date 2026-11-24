// Small top-level panels that self-mount as siblings of #hud, keyed only off
// auth/state, extracted out of client-bootstrap.ts (already at the file-line
// cap) so wiring a new one doesn't grow that file. Each mounter owns its own
// gating (e.g. mountGalaxyView/mountSpaceView no-op for accounts with no
// galaxy planets) — this just calls all of them.
import { Capacitor } from "@capacitor/core";
import type { Auth } from "firebase/auth";
import { createHostingApi } from "../client-hosted-sectors/client-hosted-sectors-api.js";
import { hostedSectorsEnabled } from "../client-hosted-sectors/client-hosted-sector-session.js";
import { mountHostedSectorsPanel } from "../client-hosted-sectors/client-hosted-sectors-panel.js";
import { mountRallyInvitePanel, mountRallyNewPanel } from "../client-rally-links/client-rally-links.js";
import { mountGalaxyView } from "../client-galaxy-view/client-galaxy-view.js";
import { mountSpaceView } from "../client-space-view/client-space-view.js";
import type { ClientState } from "../client-state/client-state.js";

export const mountBootstrapSidePanels = (deps: { state: ClientState; firebaseAuth: Auth | undefined; wsUrl: string }): void => {
  const { state, firebaseAuth, wsUrl } = deps;
  [mountRallyNewPanel, mountRallyInvitePanel].forEach((mount) => mount(firebaseAuth ? { firebaseAuth, wsUrl } : { wsUrl }));
  // The galaxy overlay's own launcher hides itself for accounts that own a
  // Planet, and Space View no longer opens it, so for them christening is not reachable from the UI (see client-galaxy-view.ts).
  mountGalaxyView(firebaseAuth ? { firebaseAuth, wsUrl } : { wsUrl });
  mountSpaceView({ state, firebaseAuth, wsUrl });
  if (hostedSectorsEnabled(Capacitor.isNativePlatform())) {
    const hostname = window.location.hostname.toLowerCase();
    mountHostedSectorsPanel({
      api: createHostingApi({ wsUrl, getIdToken: async () => firebaseAuth?.currentUser?.getIdToken() }),
      isSignedIn: () => Boolean(firebaseAuth?.currentUser),
      navigate: (path) => window.location.assign(path),
      storage: window.sessionStorage,
      shareOrigin: window.location.origin,
      pageIsLocal: hostname === "localhost" || hostname === "127.0.0.1"
    });
  }
};
