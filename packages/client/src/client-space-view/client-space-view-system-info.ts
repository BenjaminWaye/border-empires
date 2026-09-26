// What Space View can say about a system that is not yours, for the Duke panel.
import type { DukeTargetInfo } from "../client-duke-panel/client-duke-types.js";
import type { SpacePlanetViewModel } from "./client-space-view-state.js";

const STATE_TEXT: Record<SpacePlanetViewModel["state"], string> = {
  unknown: "Uncharted. You have not surveyed this system, so you cannot see who holds it.",
  other: "Held by another Duke.",
  frontier: "An outpost on the frontier of the galaxy.",
  contested: "Contested: its Stability has broken and a Defense Campaign is under way.",
  owned: "Yours."
};

export const systemInfoFor = (model: SpacePlanetViewModel): DukeTargetInfo => ({
  seasonId: model.seasonId,
  label: model.label,
  stateText: model.ownerKey?.startsWith("duke:") ? `Held by ${model.ownerKey.slice(5)}.` : STATE_TEXT[model.state]
});
