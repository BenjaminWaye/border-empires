// Single source of truth for the resource keys offerable as a domain "chosen
// trickle" sub-choice (Clockwork Stipend today, possibly more later).
//
// This constant is the contract between three callers that MUST agree:
//   - apps/simulation/src/tech-domain-bridge.ts (chosenTrickleOptionsForDomain)
//     decides which keys the sim accepts as valid trickle picks.
//   - packages/client/src/client-tech-html.ts (domainTrickleOptionKeys)
//     decides which keys the owned-domain card recognises for the suffix.
//   - packages/game-domain/src/index.ts re-exports both the const and the
//     ChosenTrickleResource type so the DomainPlayer field stays narrow.
//
// Any client-side "valid option" that the sim ignores would let the player
// pick a resource that never trickles, so changing this list must touch
// both validators in the same commit.
export const TRICKLE_RESOURCE_KEYS = ["IRON", "SUPPLY", "CRYSTAL"] as const;
export type ChosenTrickleResource = (typeof TRICKLE_RESOURCE_KEYS)[number];

export const isChosenTrickleResource = (value: unknown): value is ChosenTrickleResource =>
  typeof value === "string" && (TRICKLE_RESOURCE_KEYS as readonly string[]).includes(value);
