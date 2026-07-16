import type { CommandEnvelope } from "@border-empires/sim-protocol";

import { createAutomationCommand } from "./automation-command-factory.js";
import type {
  AutomationPlannerDiagnostic,
  AutomationPlannerResult,
  AutomationPlannerTile,
  AutomationPreplanProgressState,
  AutomationSessionPrefix
} from "./automation-command-planner.js";
import type { FrontierAnalysis } from "./frontier-command-planner.js";

type FrontierSelection = NonNullable<FrontierAnalysis["attack"]>;

export type AutomationPlannerDecisionContext<TTile extends AutomationPlannerTile> = {
  playerId: string;
  clientSeq: number;
  issuedAt: number;
  sessionPrefix: AutomationSessionPrefix;
  diagnostic: AutomationPlannerDiagnostic;
  frontierAnalysis: FrontierAnalysis;
  tilesByKey: ReadonlyMap<string, TTile>;
  needsFood: boolean;
  preplanProgressState?: AutomationPreplanProgressState;
  needsEconomy: boolean;
};

export const buildPlannerCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  type: CommandEnvelope["type"],
  payload: Record<string, number | string>
): AutomationPlannerResult => ({
  command: createAutomationCommand(
    context.sessionPrefix,
    context.playerId,
    context.clientSeq,
    context.issuedAt,
    type,
    payload
  ),
  diagnostic: context.diagnostic
});

export const buildPlannerFrontierCommand = <TTile extends AutomationPlannerTile>(
  context: AutomationPlannerDecisionContext<TTile>,
  selection: FrontierSelection,
  type: "ATTACK" | "EXPAND"
): AutomationPlannerResult =>
  buildPlannerCommand(context, type, {
    fromX: selection.from.x,
    fromY: selection.from.y,
    toX: selection.target.x,
    toY: selection.target.y
  });
