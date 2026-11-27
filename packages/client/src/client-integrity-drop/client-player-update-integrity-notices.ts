// The PLAYER_UPDATE integrity step client-network.ts calls (that file is far
// past the line cap, so the steps live here): apply the new Integrity value,
// end the post-INIT "…" wait on a full update (client-player-freshness.ts),
// then let the drop notice observe it (client-integrity-drop-notice.ts).

import type { ClientState } from "../client-state/client-state.js";
import { applyPlayerUpdateIntegrity } from "../client-integrity-pct/client-player-update-integrity.js";
import { notePlayerUpdateFreshness } from "../client-player-freshness/client-player-freshness.js";
import { observeIntegrityDropFromUpdate, type IntegrityDropDeps } from "./client-integrity-drop-notice.js";

type UpdateState = Parameters<typeof applyPlayerUpdateIntegrity>[0] &
  Parameters<typeof observeIntegrityDropFromUpdate>[0] &
  Pick<ClientState, "awaitingFreshPlayerUntil">;

export const applyPlayerUpdateIntegrityWithNotices = (
  state: UpdateState,
  msg: Parameters<typeof applyPlayerUpdateIntegrity>[1],
  previousPct: number,
  deps: IntegrityDropDeps
): void => {
  applyPlayerUpdateIntegrity(state, msg, previousPct);
  notePlayerUpdateFreshness(state, msg);
  observeIntegrityDropFromUpdate(state, msg, deps);
};
