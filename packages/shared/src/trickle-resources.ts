// Single source of truth for the resource keys offerable as a domain "chosen
// trickle" sub-choice (Clockwork Stipend today, possibly more later).
//
// Imported directly by sim and client (no re-export hops) so changing the
// list updates the contract everywhere:
//   - apps/simulation/src/tech-domain-bridge.ts (chosenTrickleOptionsForDomain)
//     iterates this list to decide which data keys the sim accepts.
//   - packages/client/src/client-tech-html.ts (domainTrickleOptionKeys)
//     does the same for the owned-domain suffix gate.
//   - apps/simulation/src/runtime.ts, apps/realtime-gateway/* and
//     packages/client/* call isChosenTrickleResource to validate payload
//     fields at every network/storage boundary.
//   - packages/game-domain narrows DomainPlayer.chosenTrickleResource to
//     the derived ChosenTrickleResource type.
//
// Any addition or removal must touch this file. The parity test in
// tech-domain-bridge.test.ts compares the raw domain-tree.json keys to
// TRICKLE_RESOURCE_KEYS and fails loud on either-direction drift.
export const TRICKLE_RESOURCE_KEYS = ["IRON", "SUPPLY", "CRYSTAL"] as const;
export type ChosenTrickleResource = (typeof TRICKLE_RESOURCE_KEYS)[number];

export const isChosenTrickleResource = (value: unknown): value is ChosenTrickleResource =>
  typeof value === "string" && (TRICKLE_RESOURCE_KEYS as readonly string[]).includes(value);
