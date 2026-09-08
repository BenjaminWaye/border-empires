// Extracted from client-types.ts to keep that file from growing past the
// 500-line cap (see AGENTS.md file-line-limit rule) — re-exported from
// client-types.ts so existing importers don't need to change.
export type SurveySweepPingKind = "resource" | "town";
export type SurveySweepPing = {
  x: number;
  y: number;
  kind: SurveySweepPingKind;
  createdAt: number;
  expiresAt: number;
};
