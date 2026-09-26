import type { DailyStoryEventType } from "./activity-dashboard-types.js";

export type WorldPulsePower = {
  playerId: string;
  name: string;
  score: number;
  rank: number;
};

export type WorldPulseStory = {
  type: DailyStoryEventType;
  headline: string;
  text: string;
  participantIds: string[];
};

// Authenticated, player-specific projection of the public activity digest.
// It intentionally carries no coordinates or raw activity rows: World Pulse
// is a briefing, not a way to inspect unexplored territory.
export type WorldPulse = {
  generatedAt: string;
  seasonId: string;
  seasonLabel?: string;
  rank?: number;
  rankChange?: number;
  leadingPowers: WorldPulsePower[];
  stories: WorldPulseStory[];
};
