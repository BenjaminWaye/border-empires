import type { DomainPlayer, DomainTileState } from "./index.js";
import { appendPlayerEventLogEntry, type PlayerEventLogEntry } from "./player-event-log.js";
import { prospectSignatureResource, type ProspectSignature } from "@border-empires/shared";

const techForSignature: Record<ProspectSignature, string> = {
  BLACKWOOD_CANOPY: "leatherworking",
  FERROUS_DUST: "masonry",
  REFRACTIVE_GROUND: "crystal-lattices"
};

const bearingFor = (dx: number, dy: number): string => {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
};

const distanceBandRank: Record<"NEAR" | "MID" | "FAR", number> = { NEAR: 0, MID: 1, FAR: 2 };

export const appendOccupationSurveyReports = (
  player: DomainPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  townX: number,
  townY: number,
  now: number
): void => {
  const existing = player.eventLog ?? [];
  const reports = new Map<string, PlayerEventLogEntry>();
  for (const entry of existing) {
    if (
      entry.type === "OCCUPATION_SURVEY" &&
      entry.surveyResource &&
      entry.surveySignature &&
      !player.techIds.has(techForSignature[entry.surveySignature])
    ) {
      reports.set(entry.surveyResource, entry);
    }
  }
  for (const tile of tiles.values()) {
    const signature = tile.prospectSignature;
    if (!signature || player.techIds.has(techForSignature[signature])) continue;
    const dx = tile.x - townX;
    const dy = tile.y - townY;
    const distance = Math.abs(dx) + Math.abs(dy);
    if (distance < 3 || distance > 14) continue;
    const resource = prospectSignatureResource(signature);
    const distanceBand = distance <= 5 ? "NEAR" : distance <= 9 ? "MID" : "FAR";
    const confidence = distanceBand === "NEAR" ? "HIGH" : distanceBand === "MID" ? "MEDIUM" : "LOW";
    const current = reports.get(resource);
    if (current?.distanceBand && distanceBandRank[current.distanceBand] <= distanceBandRank[distanceBand]) continue;
    reports.set(resource, {
      id: `occupation-survey:${resource}:${now}`,
      type: "OCCUPATION_SURVEY",
      text: `${signature === "FERROUS_DUST" ? "Ferrous dust" : signature === "BLACKWOOD_CANOPY" ? "Blackwood canopy" : "Refractive ground"} ${bearingFor(dx, dy)} of this town indicates likely ${resource === "GEMS" ? "Crystal" : resource[0] + resource.slice(1).toLowerCase()}-bearing territory.`,
      occurredAt: now,
      x: townX,
      y: townY,
      surveyResource: resource,
      surveySignature: signature,
      surveyX: tile.x,
      surveyY: tile.y,
      bearing: bearingFor(dx, dy),
      distanceBand,
      confidence
    });
  }
  player.eventLog = existing.filter((entry) => entry.type !== "OCCUPATION_SURVEY");
  for (const report of reports.values()) {
    appendPlayerEventLogEntry(player, report);
  }
};
