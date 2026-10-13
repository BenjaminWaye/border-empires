import type { ClientState } from "../client-state/client-state.js";
import { showSovereignSiegeEngineStrikeOverlay } from "../client-sovereign-siege-engine-strike-announcement/client-sovereign-siege-engine-strike-announcement.js";
import { fetchSovereignSiegeEngineStrikeHistory } from "../client-sovereign-siege-engine-strike-history/client-sovereign-siege-engine-strike-history.js";

type FeedEntryInput = { text: string; type?: string; severity?: string; at?: number; focusX?: number; focusY?: number; actionLabel?: string };

export type SovereignSiegeEngineStrikeAnnouncementDeps = {
  state: ClientState;
  appendFeedEntry: (entry: FeedEntryInput) => void;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
};

// Applies a live SOVEREIGN_SIEGE_ENGINE_STRIKE_ANNOUNCEMENT broadcast (client-network.ts):
// dedupes by strikeId, then in one shot triggers the global camera shake, shows
// the destruction popup, logs a feed toast, and records it into the 12h history
// list. Pulled out of client-network.ts (already over this repo's 500-line
// file-size gate) to keep that file's SOVEREIGN_SIEGE_ENGINE_STRIKE_ANNOUNCEMENT handling
// to a single call.
export const applySovereignSiegeEngineStrikeAnnouncement = (msg: Record<string, unknown>, deps: SovereignSiegeEngineStrikeAnnouncementDeps): void => {
  const strikeId = typeof msg.strikeId === "string" ? msg.strikeId : "";
  if (!strikeId || deps.state.sovereignSiegeEngineStrikeSeenIds.has(strikeId)) return;

  const occurredAt = typeof msg.occurredAt === "number" ? msg.occurredAt : Date.now();
  const targetX = Number(msg.targetX ?? -1);
  const targetY = Number(msg.targetY ?? -1);
  const casterName = (msg.casterName as string | undefined) || "Unknown Empire";
  const targetOwnerName = (msg.targetOwnerName as string | undefined) || "Unknown Empire";
  const townName = (msg.townName as string | undefined) || "";
  const populationTier = (msg.populationTier as "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" | undefined) ?? "TOWN";
  const populationLost = Number(msg.populationLost ?? 0);

  deps.state.sovereignSiegeEngineStrikeSeenIds.add(strikeId);
  deps.state.sovereignSiegeEngineStrikeAnnouncements.unshift({
    strikeId, occurredAt, casterName, targetX, targetY, townName, populationTier, populationLost, targetOwnerName
  });
  deps.state.sovereignSiegeEngineStrikeAnnouncements = deps.state.sovereignSiegeEngineStrikeAnnouncements.slice(0, 50);
  deps.state.sovereignSiegeEngineStrikeShakeQueue.push({ strikeId, queuedAt: Date.now() });
  deps.appendFeedEntry({
    text: `${casterName} struck ${targetOwnerName}'s ${townName || "city"} with the Sovereign Siege Engine — ${populationLost.toLocaleString()} lives lost.`,
    type: "combat",
    severity: "error",
    at: Date.now(),
    focusX: targetX,
    focusY: targetY,
    actionLabel: "Center"
  });
  showSovereignSiegeEngineStrikeOverlay({
    x: targetX,
    y: targetY,
    townName,
    populationTier,
    populationLost,
    casterName,
    targetOwnerName,
    onJumpToTarget: () => {
      deps.state.camX = targetX;
      deps.state.camY = targetY;
      deps.state.camSubX = 0;
      deps.state.camSubY = 0;
      deps.state.selected = { x: targetX, y: targetY };
      deps.requestViewRefresh(2, true);
    }
  });
};

// Silent backfill of up to the last 12h of strikes this client may have
// missed while offline — called on every INIT (first connect and each
// reconnect). No feed toast, popup, or shake replay for backfilled entries.
export const backfillSovereignSiegeEngineStrikeHistory = (state: ClientState, wsUrl: string, renderHud: () => void): void => {
  void fetchSovereignSiegeEngineStrikeHistory(wsUrl).then((records) => {
    let changed = false;
    for (const record of records) {
      if (state.sovereignSiegeEngineStrikeSeenIds.has(record.strikeId)) continue;
      state.sovereignSiegeEngineStrikeSeenIds.add(record.strikeId);
      state.sovereignSiegeEngineStrikeAnnouncements.push(record);
      changed = true;
    }
    if (!changed) return;
    state.sovereignSiegeEngineStrikeAnnouncements.sort((a, b) => b.occurredAt - a.occurredAt);
    state.sovereignSiegeEngineStrikeAnnouncements = state.sovereignSiegeEngineStrikeAnnouncements.slice(0, 50);
    renderHud();
  });
};
