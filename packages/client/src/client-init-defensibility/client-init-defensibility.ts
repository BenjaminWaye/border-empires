// Extracted from client-network-init-message.ts (which is at the 500-line
// file cap) purely to keep that file's growth budget available for new
// state fields -- no behavior change. integrityPct is the server-
// authoritative empire-integrity percentage (local-support model,
// docs/manpower-economy-rewrite-plan.md §7.2) -- use it directly when
// present so the display matches the real mechanic rather than an
// approximation recomputed client-side from just two aggregate T/E numbers.
// Falls back to the legacy T/E-ratio recompute for any server payload that
// hasn't been updated to send it yet.
export const initDefensibilityPct = (
  player: Record<string, unknown>,
  defensibilityPctFromTE: (t: number | undefined, e: number | undefined) => number
): number =>
  typeof player.integrityPct === "number" && Number.isFinite(player.integrityPct)
    ? Math.max(0, Math.min(100, player.integrityPct as number))
    : defensibilityPctFromTE(
        (player.Ts as number | undefined) ?? (player.T as number | undefined),
        (player.Es as number | undefined) ?? (player.E as number | undefined)
      );
