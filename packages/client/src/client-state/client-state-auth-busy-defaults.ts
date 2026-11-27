import type { InitTransferProgress } from "../client-socket-types.js";
import type { MapPrepState } from "../client-map-prep/client-map-prep-stages.js";
import type { DeployStatus } from "../client-deploy-countdown/client-deploy-countdown.js";

/**
 * Login overlay ("Securing session") state, extracted out of client-state.ts
 * (already over the file-line cap) so new fields don't grow that file.
 * `initTransfer` tracks the chunked INIT download — see
 * client-multiplex-websocket.ts and shared init-transfer.ts.
 */
export const createInitialAuthBusyState = () => ({
  authBusy: false,
  authBusyStartedAt: 0,
  authRetrying: false,
  authRetryAttempt: 0,
  authRetryNextAt: 0,
  authConfigured: false,
  authUserLabel: "",
  authEmail: "",
  authError: "",
  authBusyTitle: "",
  authBusyDetail: "",
  // Start of the current outage on the login overlay (0 = online); drives the
  // late manual Retry (client-auth-deploy-wait.ts). Cleared on INIT.
  authOfflineSince: 0,
  // Running server deploy read from /__deploy_status.json while offline
  // (client-deploy-status-poller.ts); null = none known. Cleared on INIT.
  deployStatus: null as DeployStatus | null,
  initTransfer: null as InitTransferProgress | null,
  // Staged 3D map build after login, shown on the same overlay (client-map-prep.ts).
  mapPrep: null as MapPrepState | null
});
