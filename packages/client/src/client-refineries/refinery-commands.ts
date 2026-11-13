// Refinery commands and their rejections (docs/territory-development-plan.md,
// Phase 2): a refinery build carries the chosen field as fieldX/fieldY on
// BUILD_ECONOMIC_STRUCTURE (through the development queue's BUILD_STRUCTURE
// payload), and "Change field" sends ASSIGN_REFINERY_FIELD.
import { REFINERY_REACH_LAND_TILES, type RefineryType } from "@border-empires/shared";

export type RefineryBuildPayload = { type: "BUILD_STRUCTURE"; x: number; y: number; structureType: RefineryType; fieldX: number; fieldY: number };
export type AssignRefineryFieldPayload = { type: "ASSIGN_REFINERY_FIELD"; x: number; y: number; fieldX: number; fieldY: number };

export const refineryBuildPayload = (type: RefineryType, site: { x: number; y: number }, field: { x: number; y: number }): RefineryBuildPayload =>
  ({ type: "BUILD_STRUCTURE", x: site.x, y: site.y, structureType: type, fieldX: field.x, fieldY: field.y });

export const assignRefineryFieldPayload = (refinery: { x: number; y: number }, field: { x: number; y: number }): AssignRefineryFieldPayload =>
  ({ type: "ASSIGN_REFINERY_FIELD", x: refinery.x, y: refinery.y, fieldX: field.x, fieldY: field.y });

const REFINERY_REJECTIONS: Readonly<Record<string, string>> = {
  REFINERY_NO_FIELD: `No free deposit field of this resource is linked to the town within ${REFINERY_REACH_LAND_TILES} land tiles. Claim a field and the land between, or free one from another refinery.`,
  REFINERY_FIELD_INVALID: "Choose a deposit tile you hold of this refinery's resource: Titanium for a Titanium Refinery, Umbrite for Umbrite, Gems for Crystal.",
  REFINERY_FIELD_UNCHANGED: "This refinery already processes that field.",
  REFINERY_FIELD_UNLINKED: `That field is not linked to the town: your own land must join them within ${REFINERY_REACH_LAND_TILES} land tiles (water and other empires' land break the link).`,
  REFINERY_FIELD_TAKEN: "Another of your refineries already processes that field. Change that refinery's field first, or choose another.",
  REFINERY_NO_TOWN: "A refinery must stand on the support ring of one of your towns.",
};

/** A human message for a refinery rejection code; undefined for every other code. */
export const refineryRejectionMessage = (code: string, message = ""): string | undefined => {
  // REFINERY_INVALID covers several cases (no refinery, not yours, being removed): the server's text names which.
  const text = code === "REFINERY_INVALID" ? `${message || "there is no refinery of yours on that tile"}.` : REFINERY_REJECTIONS[code];
  return text ? `Refinery blocked: ${text}` : undefined;
};

/** A queued build payload's refinery field (both coordinates, integers), or nothing: older or other builds carry none. */
export const refineryFieldOf = (payload: object): { fieldX?: number; fieldY?: number } => {
  const { fieldX, fieldY } = payload as { fieldX?: unknown; fieldY?: unknown };
  return Number.isInteger(fieldX) && Number.isInteger(fieldY) ? { fieldX: fieldX as number, fieldY: fieldY as number } : {};
};
