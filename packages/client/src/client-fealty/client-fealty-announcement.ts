// The gateway words an alliance answer as "<Name> accepted your alliance offer."
// (social-state-types.ts, and the AI responder's "accepted your alliance.
// <reason>"). The gateway doesn't know sizes, so the client rewords that first
// sentence as fealty when the pair is unequal (client-fealty.ts) and keeps
// anything after it (an AI's reason). Text it doesn't recognise passes through.
import type { FealtyStanding } from "./client-fealty.js";

type Rewrite = { pattern: RegExp; swear: (name: string) => string; demand: (name: string) => string };

// `standing` is yours with the other House in each line.
const REWRITES: readonly Rewrite[] = [
  { pattern: /^(.+?) accepted your alliance(?: offer)?\./, swear: (n) => `${n} accepted your fealty.`, demand: (n) => `${n} swore fealty to you.` },
  { pattern: /^(.+?) declined your alliance(?: offer)?\./, swear: (n) => `${n} refused your fealty.`, demand: (n) => `${n} refused to swear fealty.` },
  { pattern: /^You accepted (.+?)'s alliance(?: offer)?\./, swear: (n) => `You swore fealty to ${n}.`, demand: (n) => `You accepted ${n}'s fealty.` },
  { pattern: /^You declined (.+?)'s alliance(?: offer)?\./, swear: (n) => `You refused to swear fealty to ${n}.`, demand: (n) => `You refused ${n}'s fealty.` }
];

export const fealtyAnnouncement = (announcement: string, standing: FealtyStanding): string => {
  if (standing === "ALLIANCE") return announcement;
  for (const rewrite of REWRITES) {
    const match = rewrite.pattern.exec(announcement);
    if (!match?.[1]) continue;
    const head = standing === "SWEAR" ? rewrite.swear(match[1]) : rewrite.demand(match[1]);
    return `${head}${announcement.slice(match[0].length)}`;
  }
  return announcement;
};

/** Popup title for an answered alliance offer, by your standing with the other House. */
export const fealtyAnswerTitle = (accepted: boolean, standing: FealtyStanding): string | undefined => {
  if (standing === "ALLIANCE") return undefined;
  if (!accepted) return "Fealty refused";
  return standing === "SWEAR" ? "Fealty sworn" : "Fealty sworn to you";
};

type Request = { id: string; fromPlayerId: string; toPlayerId: string };

/**
 * Who an ALLIANCE_UPDATE's announcement is about: the House whose pending offer
 * left the lists (yours answered, or theirs you answered), else a new ally.
 * Read before the update is applied.
 */
export const allianceAnswerCounterpart = (
  before: { allies: readonly string[]; incomingAllianceRequests: readonly Request[]; outgoingAllianceRequests: readonly Request[] },
  msg: Record<string, unknown>
): string | undefined => {
  const gone = (list: readonly Request[], after: unknown): Request | undefined => {
    if (!Array.isArray(after)) return undefined;
    const remaining = new Set(after.map((request: { id?: string }) => request?.id));
    return list.find((request) => !remaining.has(request.id));
  };
  const answeredOutgoing = gone(before.outgoingAllianceRequests, msg.outgoingAllianceRequests);
  if (answeredOutgoing) return answeredOutgoing.toPlayerId;
  const answeredIncoming = gone(before.incomingAllianceRequests, msg.incomingAllianceRequests);
  if (answeredIncoming) return answeredIncoming.fromPlayerId;
  const allies = Array.isArray(msg.allies) ? (msg.allies as unknown[]) : [];
  return allies.find((id): id is string => typeof id === "string" && !before.allies.includes(id));
};
