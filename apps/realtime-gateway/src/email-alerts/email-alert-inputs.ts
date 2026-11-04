// Alert input shapes for EmailAlertService, split out of email-alerts.ts (500-line source budget).
export type SocialRequestAlertInput = {
  recipientPlayerId: string;
  senderName: string;
};

export type TruceRequestAlertInput = SocialRequestAlertInput & {
  durationHours: 12 | 24;
};

export type AttackAlertInput = {
  defenderPlayerId: string;
  attackerName: string;
  x: number;
  y: number;
};

export type AetherPurgeAlertInput = {
  defenderPlayerId: string;
  attackerName: string;
  x: number;
  y: number;
};

export type ManpowerFullAlertInput = {
  recipientPlayerId: string;
};

export type SeasonStartAlertInput = {
  recipientPlayerId: string;
  previousWinnerName?: string;
  /** True when recipientPlayerId is themself the previous season's winner — folds a victory recap into this same email. */
  isPreviousWinner?: boolean;
  objectiveName?: string;
};

export type AetherHijackAlertInput = {
  defenderPlayerId: string;
  attackerName: string;
  x: number;
  y: number;
  casterX: number;
  casterY: number;
  endsAt: number;
};
