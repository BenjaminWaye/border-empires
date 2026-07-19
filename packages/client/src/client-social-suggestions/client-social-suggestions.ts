import type { ClientState } from "../client-state/client-state.js";

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

// AI player ids (`ai-1` .. `ai-N`) are pre-registered on the gateway for the
// whole configured AI roster before those AI empires have founded any
// settlement this season, so `playerNames` can contain "phantom" AI entries
// that never became active. Only surface an AI id as an alliance target once
// it has real activity (i.e. it shows up in the already-activity-filtered
// leaderboard); real human players are never subject to this check.
const isEligibleAllianceTargetId = (playerId: string, activePlayerIds: ReadonlySet<string>): boolean =>
  !playerId.startsWith("ai-") || activePlayerIds.has(playerId);

export const allianceTargetSuggestions = (state: SocialSuggestionState): string[] => {
  const names: string[] = [];
  const seen = new Set<string>();
  const excluded = new Set<string>(["barbarians"]);
  if (state.meName.trim()) excluded.add(state.meName.trim().toLocaleLowerCase());
  const activePlayerIds = new Set(state.leaderboard.overall.map((entry) => entry.id));

  for (const [playerId, playerName] of state.playerNames.entries()) {
    if (playerId === state.me || !isEligibleAllianceTargetId(playerId, activePlayerIds)) continue;
    pushUniqueName(names, seen, playerName, excluded);
  }

  for (const entry of state.leaderboard.overall) {
    // AI players are already covered by the playerNames loop above with the
    // stable "AI N" name that social-state's resolveByName expects. The
    // leaderboard reports each AI's live seasonal name (e.g. "Freja Sund"),
    // which is not resolvable and would otherwise be offered as a second,
    // separate suggestion that fails with "target not found" when selected.
    if (entry.id === state.me || entry.id.startsWith("ai-")) continue;
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

const allianceTargetSuggestionsSignature = (names: string[]): string => names.join("\u0000");

// Rewriting a <datalist>'s innerHTML while its backing <input list=...> is
// open/focused closes or flickers the autocomplete popup, even when the
// replacement markup is unchanged. renderClientHud fires on nearly every
// inbound gateway message, so the alliance-target datalist must only be
// touched when the underlying suggestion list actually changed.
export const shouldRewriteAllianceTargetOptions = (
  datalistEl: Pick<HTMLDataListElement, "dataset">,
  signature: string
): boolean => datalistEl.dataset.allianceTargetsSig !== signature;

export const renderAllianceTargetOptionsIfChanged = (datalistEl: HTMLDataListElement, state: SocialSuggestionState): void => {
  const names = allianceTargetSuggestions(state);
  const signature = allianceTargetSuggestionsSignature(names);
  if (!shouldRewriteAllianceTargetOptions(datalistEl, signature)) return;
  datalistEl.innerHTML = allianceTargetSuggestionOptionsHtml(names);
  datalistEl.dataset.allianceTargetsSig = signature;
};
