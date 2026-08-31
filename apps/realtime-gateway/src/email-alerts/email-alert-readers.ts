// "Incoming *" payload readers, split out of email-alerts.ts to keep that
// file under the repo's 500-line cap (see AGENTS.md's file-line-limit rule).
import { unwrapPayloadSource } from "../broadcast-payload/broadcast-payload.js";

export type IncomingAllianceRequestAlert = {
  recipientPlayerId: string;
  senderName: string;
};

export type IncomingTruceRequestAlert = IncomingAllianceRequestAlert & {
  durationHours: 12 | 24;
};

export type IncomingAttackAlert = {
  attackerName: string;
  x: number;
  y: number;
};

export type IncomingAetherPurgeAlert = {
  attackerName: string;
  x: number;
  y: number;
};

const readStringField = (value: Record<string, unknown>, key: string): string | undefined => {
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field : undefined;
};

const readNumberField = (value: Record<string, unknown>, key: string): number | undefined => {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
};

export const readIncomingAllianceRequestAlert = (
  payloadsByPlayerId: Map<string, unknown[]>
): IncomingAllianceRequestAlert | undefined => {
  for (const [playerId, payloads] of payloadsByPlayerId) {
    for (const payload of payloads) {
      const source = unwrapPayloadSource(payload);
      if (!source || typeof source !== "object") continue;
      const typed = source as Record<string, unknown>;
      if (typed.type !== "ALLIANCE_REQUEST_INCOMING") continue;
      const request = typed.request && typeof typed.request === "object" ? (typed.request as Record<string, unknown>) : undefined;
      return {
        recipientPlayerId: readStringField(request ?? typed, "toPlayerId") ?? playerId,
        senderName:
          readStringField(typed, "fromName") ??
          (request ? readStringField(request, "fromName") : undefined) ??
          readStringField(request ?? typed, "fromPlayerId") ??
          "Another empire"
      };
    }
  }
  return undefined;
};

export const readIncomingTruceRequestAlert = (
  payloadsByPlayerId: Map<string, unknown[]>
): IncomingTruceRequestAlert | undefined => {
  for (const [playerId, payloads] of payloadsByPlayerId) {
    for (const payload of payloads) {
      const source = unwrapPayloadSource(payload);
      if (!source || typeof source !== "object") continue;
      const typed = source as Record<string, unknown>;
      if (typed.type !== "TRUCE_REQUEST_INCOMING") continue;
      const request = typed.request && typeof typed.request === "object" ? (typed.request as Record<string, unknown>) : undefined;
      const durationHours = readNumberField(request ?? typed, "durationHours");
      if (durationHours !== 12 && durationHours !== 24) continue;
      return {
        recipientPlayerId: readStringField(request ?? typed, "toPlayerId") ?? playerId,
        senderName:
          readStringField(typed, "fromName") ??
          (request ? readStringField(request, "fromName") : undefined) ??
          readStringField(request ?? typed, "fromPlayerId") ??
          "Another empire",
        durationHours
      };
    }
  }
  return undefined;
};

export const readAttackAlert = (payload: Record<string, unknown>): IncomingAttackAlert | undefined => {
  if (payload.type !== "ATTACK_ALERT") return undefined;
  const x = readNumberField(payload, "x");
  const y = readNumberField(payload, "y");
  if (typeof x !== "number" || typeof y !== "number") return undefined;
  return {
    attackerName: readStringField(payload, "attackerName") ?? readStringField(payload, "attackerId") ?? "Another empire",
    x,
    y
  };
};

export const readAetherPurgeAlert = (payload: Record<string, unknown>): IncomingAetherPurgeAlert | undefined => {
  if (payload.type !== "AETHER_PURGE_ALERT") return undefined;
  const x = readNumberField(payload, "x");
  const y = readNumberField(payload, "y");
  if (typeof x !== "number" || typeof y !== "number") return undefined;
  return {
    attackerName: readStringField(payload, "attackerName") ?? readStringField(payload, "attackerId") ?? "Another empire",
    x,
    y
  };
};
