import type { ClientState } from "../client-state/client-state.js";
import { showWorldEngineStrikeOverlay } from "../client-world-engine-strike-announcement/client-world-engine-strike-announcement.js";
import { fetchWorldEngineStrikeHistory } from "../client-world-engine-strike-history/client-world-engine-strike-history.js";

type FeedEntryInput = { text: string; type?: string; severity?: string; at?: number; focusX?: number; focusY?: number; actionLabel?: string };

export type WorldEngineStrikeAnnouncementDeps = {
  state: ClientState;
  appendFeedEntry: (entry: FeedEntryInput) => void;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
};

// Applies a live WORLD_ENGINE_STRIKE_ANNOUNCEMENT broadcast (client-network.ts):
// dedupes by strikeId, then in one shot triggers the global camera shake, shows
// the destruction popup, logs a feed toast, and records it into the 12h history
// list. Pulled out of client-network.ts (already over this repo's 500-line
// file-size gate) to keep that file's WORLD_ENGINE_STRIKE_ANNOUNCEMENT handling
// to a single call.
export const applyWorldEngineStrikeAnnouncement = (msg: Record<string, unknown>, deps: WorldEngineStrikeAnnouncementDeps): void => {
  const strikeId = typeof msg.strikeId === "string" ? msg.strikeId : "";
  if (!strikeId || deps.state.worldEngineStrikeSeenIds.has(strikeId)) return;

  const occurredAt = typeof msg.occurredAt === "number" ? msg.occurredAt : Date.now();
  const targetX = Number(msg.targetX ?? -1);
  const targetY = Number(msg.targetY ?? -1);
  const casterName = (msg.casterName as string | undefined) || "Unknown Empire";
  const targetOwnerName = (msg.targetOwnerName as string | undefined) || "Unknown Empire";
  const townName = (msg.townName as string | undefined) || "";
  const populationTier = (msg.populationTier as "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" | undefined) ?? "TOWN";
  const populationLost = Number(msg.populationLost ?? 0);

  deps.state.worldEngineStrikeSeenIds.add(strikeId);
  deps.state.worldEngineStrikeAnnouncements.unshift({
    strikeId, occurredAt, casterName, targetX, targetY, townName, populationTier, populationLost, targetOwnerName
  });
  deps.state.worldEngineStrikeAnnouncements = deps.state.worldEngineStrikeAnnouncements.slice(0, 50);
  deps.state.worldEngineStrikeShakeQueue.push({ strikeId, queuedAt: Date.now() });
  deps.appendFeedEntry({
    text: `${casterName} struck ${targetOwnerName}'s ${townName || "city"} with the World Engine — ${populationLost.toLocaleString()} lives lost.`,
    type: "combat",
    severity: "error",
    at: Date.now(),
    focusX: targetX,
    focusY: targetY,
    actionLabel: "Center"
  });
  showWorldEngineStrikeOverlay({
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
export const backfillWorldEngineStrikeHistory = (state: ClientState, wsUrl: string, renderHud: () => void): void => {
  void fetchWorldEngineStrikeHistory(wsUrl).then((records) => {
    let changed = false;
    for (const record of records) {
      if (state.worldEngineStrikeSeenIds.has(record.strikeId)) continue;
      state.worldEngineStrikeSeenIds.add(record.strikeId);
      state.worldEngineStrikeAnnouncements.push(record);
      changed = true;
    }
    if (!changed) return;
    state.worldEngineStrikeAnnouncements.sort((a, b) => b.occurredAt - a.occurredAt);
    state.worldEngineStrikeAnnouncements = state.worldEngineStrikeAnnouncements.slice(0, 50);
    renderHud();
  });
};
