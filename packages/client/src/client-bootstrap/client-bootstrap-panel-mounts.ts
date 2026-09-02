// Small top-level panels that self-mount as siblings of #hud, keyed only off
// auth/state, extracted out of client-bootstrap.ts (already at the file-line
// cap) so wiring a new one doesn't grow that file. Each mounter owns its own
// gating (e.g. mountGalaxyView/mountSpaceView no-op for accounts with no
// galaxy planets) — this just calls all of them.
import type { Auth } from "firebase/auth";
import { mountRallyInvitePanel, mountRallyNewPanel } from "../client-rally-links/client-rally-links.js";
import { mountGalaxyView } from "../client-galaxy-view/client-galaxy-view.js";
import { mountSpaceView } from "../client-space-view/client-space-view.js";
import type { ClientState } from "../client-state/client-state.js";

export const mountBootstrapSidePanels = (deps: { state: ClientState; firebaseAuth: Auth | undefined; wsUrl: string }): void => {
  const { state, firebaseAuth, wsUrl } = deps;
  [mountRallyNewPanel, mountRallyInvitePanel].forEach((mount) => mount(firebaseAuth ? { firebaseAuth, wsUrl } : { wsUrl }));
  // Space View gets the single entry-point button for accounts that own a
  // Planet; the galaxy overlay's own launcher hides itself for them and
  // stays reachable only via the handle passed through (christening,
  // Emperor endorsement) — see client-galaxy-view.ts's GalaxyViewHandle.
  const galaxyView = mountGalaxyView(firebaseAuth ? { firebaseAuth, wsUrl } : { wsUrl });
  mountSpaceView({ state, firebaseAuth, wsUrl, openGalaxyManage: galaxyView.open });
};
