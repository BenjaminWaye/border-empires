// Client state for achievements (PLAYER_UPDATE `achievements`, simulation
// achievements/achievement-view.ts) and the live Longest Road holder
// (LONGEST_ROAD push, simulation longest-road/longest-road-ticker.ts).
import { isAchievementId, parseLongestRoadPayload, type AchievementId, type AchievementsView, type LiveLongestRoad } from "@border-empires/shared";

export const createInitialAchievementsState = () => ({
  /** Your achievements; undefined until the first PLAYER_UPDATE that carries them. */
  achievements: undefined as AchievementsView | undefined,
  /** Who holds Longest Road now: undefined before the first push, null when nobody has a road yet. */
  liveLongestRoad: undefined as LiveLongestRoad | null | undefined
});

type AchievementsState = ReturnType<typeof createInitialAchievementsState>;

const parseRecord = (value: unknown): Partial<Record<AchievementId, number>> => {
  const out: Partial<Record<AchievementId, number>> = {};
  if (!value || typeof value !== "object") return out;
  for (const [id, n] of Object.entries(value)) if (isAchievementId(id) && typeof n === "number" && Number.isFinite(n)) out[id] = n;
  return out;
};

/** A PLAYER_UPDATE without `achievements` (partial update) leaves the state alone. */
export const applyPlayerUpdateAchievements = (state: AchievementsState, msg: { readonly achievements?: unknown }): void => {
  const raw = msg.achievements;
  if (!raw || typeof raw !== "object") return;
  const view = raw as { progress?: unknown; earned?: unknown };
  state.achievements = { progress: parseRecord(view.progress), earned: parseRecord(view.earned) };
};

/** Returns false for a malformed LONGEST_ROAD (state untouched). */
export const applyLongestRoadMessage = (state: AchievementsState, msg: Record<string, unknown>): boolean => {
  const road = parseLongestRoadPayload(msg);
  if (road === undefined) return false;
  state.liveLongestRoad = road;
  return true;
};
