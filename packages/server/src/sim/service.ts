import type { ClientMessage, EconomicStructureType } from "@border-empires/shared";

import { createSimulationCommandBus, type SimulationCommandPriority, type SimulationCommandWorkerState } from "./command-bus.js";

export type SimulationCommand =
  | { type: "EXPAND"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "ATTACK"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "SETTLE"; x: number; y: number }
  | { type: "BUILD_FORT"; x: number; y: number }
  | { type: "BUILD_ECONOMIC_STRUCTURE"; x: number; y: number; structureType: EconomicStructureType };

export type QueuedSimulationMessage =
  | SimulationCommand
  | { type: "BUILD_OBSERVATORY"; x: number; y: number }
  | { type: "BUILD_SIEGE_OUTPOST"; x: number; y: number };

export type SystemSimulationCommand =
  | { type: "BARBARIAN_ACTION"; agentId: string }
  | { type: "BARBARIAN_MAINTENANCE" };

export type SimulationCommandJob<TActor, TSocket> = {
  actor?: TActor;
  command: QueuedSimulationMessage | SystemSimulationCommand;
  socket: TSocket;
  priority: SimulationCommandPriority;
};

type CreateSimulationServiceDeps<TActor, TSocket> = {
  now: () => number;
  drainBudgetMs: number;
  drainMaxCommands: number;
  drainHumanQuota: number;
  drainSystemQuota: number;
  drainAiQuota: number;
  queueTask: (fn: () => void) => void;
  executeGatewayMessage: (
    actor: TActor,
    msg: ClientMessage,
    socket: TSocket,
    queuedExecution?: boolean
  ) => Promise<boolean | void>;
  executeSystemCommand: (command: SystemSimulationCommand) => Promise<void>;
  onError: (message: string, err: unknown) => void;
  noopSocket: TSocket;
};

type SimulationService<TActor, TSocket> = {
  state: SimulationCommandWorkerState<SimulationCommandJob<TActor, TSocket>>;
  queueDepth: () => number;
  hasQueuedSystemCommand: (predicate: (job: SimulationCommandJob<TActor, TSocket>) => boolean) => boolean;
  isQueuedSimulationMessage: (msg: ClientMessage) => msg is QueuedSimulationMessage;
  handleGatewayMessage: (actor: TActor, msg: ClientMessage, socket: TSocket) => Promise<boolean>;
  executeDirectMessage: (actor: TActor, msg: ClientMessage, socket?: TSocket) => Promise<boolean | void>;
  enqueueAiCommand: (actor: TActor, command: SimulationCommand) => void;
  enqueueSystemCommand: (command: SystemSimulationCommand) => void;
};

export const createSimulationService = <TActor, TSocket>(
  deps: CreateSimulationServiceDeps<TActor, TSocket>
): SimulationService<TActor, TSocket> => {
  const shouldExecuteHumanFrontierImmediately = (msg: ClientMessage): msg is Extract<ClientMessage, { type: "ATTACK" | "EXPAND" }> =>
    msg.type === "ATTACK" || msg.type === "EXPAND";

  const isQueuedSimulationMessage = (msg: ClientMessage): msg is QueuedSimulationMessage =>
    msg.type === "SETTLE" ||
    msg.type === "BUILD_FORT" ||
    msg.type === "BUILD_OBSERVATORY" ||
    msg.type === "BUILD_ECONOMIC_STRUCTURE" ||
    msg.type === "BUILD_SIEGE_OUTPOST" ||
    msg.type === "ATTACK" ||
    msg.type === "EXPAND";

  const bus = createSimulationCommandBus<
    SimulationCommandJob<TActor, TSocket>,
    QueuedSimulationMessage,
    SystemSimulationCommand
  >({
    now: deps.now,
    drainBudgetMs: deps.drainBudgetMs,
    drainMaxCommands: deps.drainMaxCommands,
    drainHumanQuota: deps.drainHumanQuota,
    drainSystemQuota: deps.drainSystemQuota,
    drainAiQuota: deps.drainAiQuota,
    queueTask: deps.queueTask,
    executeHumanOrAiJob: async (job) => {
      await deps.executeGatewayMessage(job.actor!, job.command as ClientMessage, job.socket, true);
    },
    executeSystemCommand: deps.executeSystemCommand,
    getJobPriority: (job) => job.priority,
    getSystemCommand: (job) => job.command as SystemSimulationCommand,
    onError: deps.onError
  });

  const enqueueJob = (
    actor: TActor | undefined,
    command: QueuedSimulationMessage | SystemSimulationCommand,
    socket: TSocket,
    priority: SimulationCommandPriority
  ): void => {
    const job: SimulationCommandJob<TActor, TSocket> = actor
      ? { actor, command, socket, priority }
      : { command, socket, priority };
    bus.enqueueJob(job);
  };

  return {
    state: bus.state,
    queueDepth: bus.queueDepth,
    hasQueuedSystemCommand: bus.hasQueuedSystemCommand,
    isQueuedSimulationMessage,
    handleGatewayMessage: async (actor, msg, socket) => {
      if (shouldExecuteHumanFrontierImmediately(msg)) {
        return Boolean(await deps.executeGatewayMessage(actor, msg, socket));
      }
      if (isQueuedSimulationMessage(msg)) {
        enqueueJob(actor, msg, socket, "human");
        return true;
      }
      return Boolean(await deps.executeGatewayMessage(actor, msg, socket));
    },
    executeDirectMessage: (actor, msg, socket = deps.noopSocket) =>
      deps.executeGatewayMessage(actor, msg, socket, true),
    enqueueAiCommand: (actor, command) => {
      enqueueJob(actor, command, deps.noopSocket, "ai");
    },
    enqueueSystemCommand: (command) => {
      enqueueJob(undefined, command, deps.noopSocket, "system");
    }
  };
};
