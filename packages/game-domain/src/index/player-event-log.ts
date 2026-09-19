// §20: generic event type + text + timestamp, explicitly not hardcoded to
// just the two launch event types (town-lost, Imperial Exchange Levy) — the
// plan's own framing is "we will fill it with more things" (monument
// first-part broadcasts, Ancient Ruins discoveries, tech completions, etc.).
// Extracted out of index.ts (that file is at the repo's 500-line cap and may
// not grow) -- a pure code move plus the WAYSTATION_ACTIVATED addition.
export type PlayerEventLogEntryType =
  | "TOWN_LOST"
  | "IMPERIAL_EXCHANGE_LEVY_HIT"
  | "IMPERIAL_EXCHANGE_LEVY_CAST"
  | "MONUMENT_CLAIMED"
  | "MONUMENT_LOST_TO_RIVAL"
  | "MONUMENT_CONSTRUCTION_STARTED"
  | "NATURAL_WONDER_CLAIMED"
  | "WAYSTATION_ACTIVATED"
  | "OCCUPATION_SURVEY";

// Structured fields a WAYSTATION_ACTIVATED entry carries alongside the flat
// text/x/y every entry has, so the client can render the same rich
// activation popup it shows for a live activation (see
// client-waystation-activation.ts's WaystationActivationInfo) instead of
// just a plain feed line when the player catches up after being offline.
export type PlayerEventLogWaystationFields = {
  grantedEffect?: "VISION" | "POPULATION" | "TECH" | "RESOURCE_SLOT";
  revealedAtX?: number;
  revealedAtY?: number;
  grantedTechId?: string;
  grantedResource?: "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE";
  grantedTownName?: string;
  grantedTownX?: number;
  grantedTownY?: number;
};

export type PlayerOccupationSurveyFields = {
  surveyResource?: "TITANIUM" | "UMBRITE" | "GEMS";
  surveySignature?: "BLACKWOOD_CANOPY" | "FERROUS_DUST" | "REFRACTIVE_GROUND";
  surveyX?: number;
  surveyY?: number;
  bearing?: string;
  distanceBand?: "NEAR" | "MID" | "FAR";
  confidence?: "LOW" | "MEDIUM" | "HIGH";
};

export type PlayerEventLogEntry = {
  id: string;
  type: PlayerEventLogEntryType;
  text: string;
  occurredAt: number;
  // Optional tile the event happened at, so the client can offer a "Go to
  // tile" button. Optional because not every event type is tile-scoped.
  x?: number;
  y?: number;
} & PlayerEventLogWaystationFields & PlayerOccupationSurveyFields;

export const PLAYER_EVENT_LOG_MAX_ENTRIES = 50;

// Mutates player.eventLog in place (push + cap), matching the codebase's
// existing "grow a bounded array on the player object" convention. Kept
// dependency-free (game-domain has no simulation-runtime imports) so both
// the simulation and, if ever needed, tooling can share one implementation
// instead of drifting into two copies of "append and trim."
export const appendPlayerEventLogEntry = (
  player: { eventLog?: PlayerEventLogEntry[] },
  input: { type: PlayerEventLogEntryType; text: string; occurredAt: number; x?: number; y?: number } & PlayerEventLogWaystationFields & PlayerOccupationSurveyFields
): void => {
  const log = player.eventLog ? [...player.eventLog] : [];
  log.push({
    id: `${input.type}:${input.occurredAt}:${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    text: input.text,
    occurredAt: input.occurredAt,
    ...(typeof input.x === "number" && typeof input.y === "number" ? { x: input.x, y: input.y } : {}),
    ...(input.grantedEffect ? { grantedEffect: input.grantedEffect } : {}),
    ...(typeof input.revealedAtX === "number" ? { revealedAtX: input.revealedAtX } : {}),
    ...(typeof input.revealedAtY === "number" ? { revealedAtY: input.revealedAtY } : {}),
    ...(input.grantedTechId ? { grantedTechId: input.grantedTechId } : {}),
    ...(input.grantedResource ? { grantedResource: input.grantedResource } : {}),
    ...(input.grantedTownName ? { grantedTownName: input.grantedTownName } : {}),
    ...(typeof input.grantedTownX === "number" ? { grantedTownX: input.grantedTownX } : {}),
    ...(typeof input.grantedTownY === "number" ? { grantedTownY: input.grantedTownY } : {}),
    ...(input.surveyResource ? { surveyResource: input.surveyResource } : {}),
    ...(input.surveySignature ? { surveySignature: input.surveySignature } : {}),
    ...(typeof input.surveyX === "number" ? { surveyX: input.surveyX } : {}),
    ...(typeof input.surveyY === "number" ? { surveyY: input.surveyY } : {}),
    ...(input.bearing ? { bearing: input.bearing } : {}),
    ...(input.distanceBand ? { distanceBand: input.distanceBand } : {}),
    ...(input.confidence ? { confidence: input.confidence } : {})
  });
  player.eventLog = log.length > PLAYER_EVENT_LOG_MAX_ENTRIES ? log.slice(log.length - PLAYER_EVENT_LOG_MAX_ENTRIES) : log;
};
