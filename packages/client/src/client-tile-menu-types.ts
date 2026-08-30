// Tile action menu view types -- split out of client-types.ts (which is
// already over the repo's 500-line file-growth cap) so this cluster can grow
// independently. Re-exported from client-types.ts so existing importers of
// that path don't need to change.
import type { FrontierCombatSideBreakdown } from "@border-empires/shared";
import type { TileActionDef } from "./client-types.js";

export type TileMenuTab = "overview" | "actions" | "buildings" | "crystal" | "progress";

export type TileMenuProgressView = {
  title: string;
  detail: string;
  remainingLabel: string;
  progress: number;
  note: string;
  cancelLabel?: string;
  cancelActionId?:
    | "cancel_structure_build"
    | "cancel_queued_settlement"
    | "cancel_queued_build"
    | "cancel_settle"
    | "cancel_capture"
    | "cancel_queued_waypoint"
    | "cancel_queued_expand"
    | "cancel_queued_auto_settle";
  secondaryLabel?: string;
  secondaryActionId?: "move_queued_entry_to_front" | "move_waypoint_to_front" | "move_action_queue_entry_to_front";
  // Actions queued to fire automatically once the action above finishes
  // (e.g. a settle -- and settle+build -- queued behind an in-flight
  // expansion). Shown as a small list below the main progress card so the
  // player can see and cancel what's coming next, without it taking over
  // the primary "progress" slot (there's only one card).
  queuedNext?: { title: string; detail: string; cancelLabel: string; cancelActionId: "cancel_queued_auto_settle" }[];
  // §6.3 rush-buy: pay gold to finish this in-progress SETTLE/build right
  // now. Label is a client-side price estimate (rushBuyPriceGold, same
  // formula the server uses) — the server recomputes and enforces the real
  // charge, this is a preview only.
  rushBuyLabel?: string;
  rushBuyActionId?: "rush_buy";
  queueState?: "planned" | "queued" | "active"; // planned = client-local wishlist; queued = server-confirmed & durable
};

export type TileOverviewLine = {
  html: string;
  kind?: "effect" | "section" | "loading" | "group" | "statgrid";
  // Indents an "effect" line under the "group" heading immediately above it
  // (e.g. a Mintworks stat line nested under "6 Mintworks").
  nested?: boolean;
};

// The full "verify the math" breakdown for a pending Launch Attack action:
// each side's base/infrastructure/battle power tiers plus the resulting win
// chance, straight from the server's ATTACK_PREVIEW_RESULT so it can be
// rendered next to the attack button.
export type TileCombatBreakdown = {
  winChance: number;
  attacker: FrontierCombatSideBreakdown;
  defender: FrontierCombatSideBreakdown;
};

export type TileMenuView = {
  title: string;
  subtitle: string;
  subtitleHtml?: string;
  statusText?: string;
  statusTone?: "warning" | "neutral";
  tabs: TileMenuTab[];
  overviewKicker?: string;
  overviewLines: TileOverviewLine[];
  actions: TileActionDef[];
  buildings: TileActionDef[];
  crystal: TileActionDef[];
  progress?: TileMenuProgressView;
  combatBreakdown?: TileCombatBreakdown | undefined;
};
