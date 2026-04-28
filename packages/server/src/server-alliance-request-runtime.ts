import type { AllianceRequest } from "./server-shared-types.js";

export const findAllianceRequestBetweenPlayers = (
  requests: Iterable<AllianceRequest>,
  playerAId: string,
  playerBId: string
): AllianceRequest | undefined => {
  for (const request of requests) {
    if (
      (request.fromPlayerId === playerAId && request.toPlayerId === playerBId) ||
      (request.fromPlayerId === playerBId && request.toPlayerId === playerAId)
    ) {
      return request;
    }
  }
  return undefined;
};

export const findAllianceRequestForRecipient = (
  requests: ReadonlyMap<string, AllianceRequest>,
  requestId: string,
  recipientId: string
): AllianceRequest | undefined => {
  const request = requests.get(requestId);
  if (!request || request.toPlayerId !== recipientId) return undefined;
  return request;
};

export const findAllianceRequestForSender = (
  requests: ReadonlyMap<string, AllianceRequest>,
  requestId: string,
  senderId: string
): AllianceRequest | undefined => {
  const request = requests.get(requestId);
  if (!request || request.fromPlayerId !== senderId) return undefined;
  return request;
};
