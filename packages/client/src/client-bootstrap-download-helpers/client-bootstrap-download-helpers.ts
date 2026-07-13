import { downloadClientDebugBundle } from "../client-debug-bundle/client-debug-bundle.js";
import { downloadRespawnBugReport } from "../client-respawn-report.js";
import type { ClientState } from "../client-state/client-state.js";
import type { PlayerRespawnNotice } from "../client-types.js";

export const createBootstrapDownloadHelpers = (deps: { state: ClientState; wsUrl: string }) => ({
  downloadDebugBundle: (): Promise<void> => downloadClientDebugBundle({ state: deps.state, wsUrl: deps.wsUrl }),
  downloadRespawnReportForNotice: (args: { notice: PlayerRespawnNotice }): Promise<void> =>
    downloadRespawnBugReport({ notice: args.notice, state: deps.state, wsUrl: deps.wsUrl })
});
