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

// `value` is what actually gets submitted as the truce/alliance target
// (must be the string social-state's resolveByName recognizes, e.g. "AI 1"
// for an AI player); `label` is an optional human-friendly hint shown
// alongside it in the datalist popup (e.g. an AI's real seasonal name),
// purely cosmetic and never sent to the server.
export type AllianceTargetSuggestion = { value: string; label?: string };

const leaderboardNameForId = (state: SocialSuggestionState, playerId: string): string | undefined =>
  state.leaderboard.overall.find((entry) => entry.id === playerId)?.name;

const pushUniqueSuggestion = (
  suggestions: AllianceTargetSuggestion[],
  seen: Set<string>,
  excluded: Set<string>,
  rawValue: string | undefined,
  rawLabel?: string
): void => {
  const value = rawValue?.trim();
  if (!value) return;
  const key = value.toLocaleLowerCase();
  if (seen.has(key) || excluded.has(key)) return;
  seen.add(key);
  const label = rawLabel?.trim();
  suggestions.push(label && label !== value ? { value, label } : { value });
};

// AI player ids (`ai-1` .. `ai-N`) are pre-registered on the gateway for the
// whole configured AI roster before those AI empires have founded any
// settlement this season, so `playerNames` can contain "phantom" AI entries
// that never became active. Only surface an AI id as an alliance target once
// it has real activity (i.e. it shows up in the already-activity-filtered
// leaderboard); real human players are never subject to this check.
const isEligibleAllianceTargetId = (playerId: string, activePlayerIds: ReadonlySet<string>): boolean =>
  !playerId.startsWith("ai-") || activePlayerIds.has(playerId);

export const allianceTargetSuggestions = (state: SocialSuggestionState): AllianceTargetSuggestion[] => {
  const suggestions: AllianceTargetSuggestion[] = [];
  const seen = new Set<string>();
  const excluded = new Set<string>(["barbarians"]);
  if (state.meName.trim()) excluded.add(state.meName.trim().toLocaleLowerCase());
  const activePlayerIds = new Set(state.leaderboard.overall.map((entry) => entry.id));

  for (const [playerId, playerName] of state.playerNames.entries()) {
    if (playerId === state.me || !isEligibleAllianceTargetId(playerId, activePlayerIds)) continue;
    // The submitted value must stay the resolvable "AI N" name; the
    // leaderboard's real seasonal name (e.g. "Freja Sund") is only used as a
    // display label so the request stays resolvable server-side.
    const label = playerId.startsWith("ai-") ? leaderboardNameForId(state, playerId) : undefined;
    pushUniqueSuggestion(suggestions, seen, excluded, playerName, label);
  }

  for (const entry of state.leaderboard.overall) {
    // AI players are already covered by the playerNames loop above with the
    // stable "AI N" value (labeled with the real name); offering the real
    // name as its own suggestion here would submit an unresolvable value.
    if (entry.id === state.me || entry.id.startsWith("ai-")) continue;
    pushUniqueSuggestion(suggestions, seen, excluded, entry.name);
  }

  for (const request of state.incomingAllianceRequests) pushUniqueSuggestion(suggestions, seen, excluded, request.fromName);
  for (const request of state.outgoingAllianceRequests) pushUniqueSuggestion(suggestions, seen, excluded, request.toName);
  for (const request of state.incomingTruceRequests) pushUniqueSuggestion(suggestions, seen, excluded, request.fromName);
  for (const request of state.outgoingTruceRequests) pushUniqueSuggestion(suggestions, seen, excluded, request.toName);
  for (const truce of state.activeTruces) pushUniqueSuggestion(suggestions, seen, excluded, truce.otherPlayerName);

  return suggestions.sort((left, right) => left.value.localeCompare(right.value));
};

const escapeAttr = (raw: string): string =>
  raw.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export const allianceTargetSuggestionOptionsHtml = (suggestions: AllianceTargetSuggestion[]): string =>
  suggestions
    .map(({ value, label }) => `<option value="${escapeAttr(value)}"${label ? ` label="${escapeAttr(label)}"` : ""}></option>`)
    .join("");

const allianceTargetSuggestionsSignature = (suggestions: AllianceTargetSuggestion[]): string =>
  suggestions.map(({ value, label }) => `${value}\u0001${label ?? ""}`).join("\u0000");

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
  const suggestions = allianceTargetSuggestions(state);
  const signature = allianceTargetSuggestionsSignature(suggestions);
  if (!shouldRewriteAllianceTargetOptions(datalistEl, signature)) return;
  datalistEl.innerHTML = allianceTargetSuggestionOptionsHtml(suggestions);
  datalistEl.dataset.allianceTargetsSig = signature;
};
