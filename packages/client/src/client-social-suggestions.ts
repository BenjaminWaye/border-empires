import type { ClientState } from "./client-state.js";

type SocialSuggestionState = Pick<
  ClientState,
  | "me"
  | "meName"
  | "playerNames"
  | "leaderboard"
  | "incomingAllianceRequests"
  | "outgoingAllianceRequests"
  | "incomingTruceRequests"
  | "outgoingTruceRequests"
  | "activeTruces"
>;

const pushUniqueName = (names: string[], seen: Set<string>, raw: string | undefined, excluded: Set<string>): void => {
  const trimmed = raw?.trim();
  if (!trimmed) return;
  const key = trimmed.toLocaleLowerCase();
  if (seen.has(key) || excluded.has(key)) return;
  seen.add(key);
  names.push(trimmed);
};

export const allianceTargetSuggestions = (state: SocialSuggestionState): string[] => {
  const names: string[] = [];
  const seen = new Set<string>();
  const excluded = new Set<string>(["barbarians"]);
  if (state.meName.trim()) excluded.add(state.meName.trim().toLocaleLowerCase());

  for (const [playerId, playerName] of state.playerNames.entries()) {
    if (playerId === state.me) continue;
    pushUniqueName(names, seen, playerName, excluded);
  }

  for (const entry of state.leaderboard.overall) {
    if (entry.id === state.me) continue;
    pushUniqueName(names, seen, entry.name, excluded);
  }

  for (const request of state.incomingAllianceRequests) pushUniqueName(names, seen, request.fromName, excluded);
  for (const request of state.outgoingAllianceRequests) pushUniqueName(names, seen, request.toName, excluded);
  for (const request of state.incomingTruceRequests) pushUniqueName(names, seen, request.fromName, excluded);
  for (const request of state.outgoingTruceRequests) pushUniqueName(names, seen, request.toName, excluded);
  for (const truce of state.activeTruces) pushUniqueName(names, seen, truce.otherPlayerName, excluded);

  return names.sort((left, right) => left.localeCompare(right));
};

export const allianceTargetSuggestionOptionsHtml = (names: string[]): string =>
  names.map((name) => `<option value="${name.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}"></option>`).join("");
