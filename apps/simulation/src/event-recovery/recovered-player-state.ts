// The per-player row of RecoveredSimulationState, extracted out of
// event-recovery.ts to keep that file under the repo's 500-line cap.
// Purely the persisted/recovered player shape -- no recovery logic.
import type { ChosenTrickleResource } from "@border-empires/shared";
import type { PlayerEventLogEntry } from "@border-empires/game-domain";
import type { ExportedDevQueueEntry } from "../runtime-dev-queue-restore.js";

export type RecoveredPlayerState = {
  id: string;
  name?: string;
  isAi?: boolean;
  points?: number;
  manpower?: number;
  manpowerUpdatedAt?: number;
  manpowerCapSnapshot?: number;
  techIds?: string[];
  domainIds?: string[];
  strategicResources?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>>;
  chosenTrickleResource?: ChosenTrickleResource;
  imperialWardCharges?: number;
  wonderLastFreeRushBuyAt?: number;
  // Galactic meta-layer v0 (§5, §12) — see DomainPlayer in game-domain.
  galacticWonderManpowerRegenBonusPerMinute?: number;
  galacticWonderVisionRadiusBonus?: number;
  eventLog?: PlayerEventLogEntry[];
  allies?: string[];
  vision?: number;
  incomeMultiplier?: number;
  incomePerMinute?: number;
  ownedTownTileKeys?: string[];
  // Server-durable dev queue, including the MP/slot reservations queued BUILD
  // entries hold. Must round-trip: the reserve is already deducted from the
  // persisted `manpower` above, so dropping these entries on recovery would
  // burn that manpower permanently (see runtime-dev-queue-restore.ts).
  devQueue?: ExportedDevQueueEntry[];
};
