import type { CommandEnvelope } from "@border-empires/sim-protocol";

export type StoredSimulationCommandStatus = "QUEUED" | "ACCEPTED" | "REJECTED" | "RESOLVED";

export type StoredSimulationCommand = {
  commandId: string;
  sessionId: string;
  playerId: string;
  clientSeq: number;
  type: CommandEnvelope["type"];
  payloadJson: string;
  queuedAt: number;
  status: StoredSimulationCommandStatus;
  acceptedAt?: number;
  rejectedAt?: number;
  rejectedCode?: string;
  rejectedMessage?: string;
  resolvedAt?: number;
};

export type SimulationCommandStore = {
  persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<void>;
  markAccepted(commandId: string, acceptedAt: number): Promise<void>;
  markRejected(commandId: string, rejectedAt: number, code: string, message: string): Promise<void>;
  markResolved(commandId: string, resolvedAt: number): Promise<void>;
  get(commandId: string): Promise<StoredSimulationCommand | undefined>;
  findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredSimulationCommand | undefined>;
  loadAllCommands(): Promise<StoredSimulationCommand[]>;
};

export class InMemorySimulationCommandStore implements SimulationCommandStore {
  private readonly commands = new Map<string, StoredSimulationCommand>();
  private readonly commandIdsByPlayerSeq = new Map<string, string>();

  async persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<void> {
    const playerSeqKey = `${command.playerId}:${command.clientSeq}`;
    if (this.commands.has(command.commandId) || this.commandIdsByPlayerSeq.has(playerSeqKey)) return;

    this.commands.set(command.commandId, {
      commandId: command.commandId,
      sessionId: command.sessionId,
      playerId: command.playerId,
      clientSeq: command.clientSeq,
      type: command.type,
      payloadJson: command.payloadJson,
      queuedAt,
      status: "QUEUED"
    });
    this.commandIdsByPlayerSeq.set(playerSeqKey, command.commandId);
  }

  async markAccepted(commandId: string, acceptedAt: number): Promise<void> {
    const existing = this.commands.get(commandId);
    if (!existing) return;
    this.commands.set(commandId, {
      ...existing,
      status: "ACCEPTED",
      acceptedAt
    });
  }

  async markRejected(commandId: string, rejectedAt: number, code: string, message: string): Promise<void> {
    const existing = this.commands.get(commandId);
    if (!existing) return;
    this.commands.set(commandId, {
      ...existing,
      status: "REJECTED",
      rejectedAt,
      rejectedCode: code,
      rejectedMessage: message
    });
  }

  async markResolved(commandId: string, resolvedAt: number): Promise<void> {
    const existing = this.commands.get(commandId);
    if (!existing) return;
    this.commands.set(commandId, {
      ...existing,
      status: "RESOLVED",
      resolvedAt
    });
  }

  async get(commandId: string): Promise<StoredSimulationCommand | undefined> {
    return this.commands.get(commandId);
  }

  async findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredSimulationCommand | undefined> {
    const commandId = this.commandIdsByPlayerSeq.get(`${playerId}:${clientSeq}`);
    return commandId ? this.commands.get(commandId) : undefined;
  }

  async loadAllCommands(): Promise<StoredSimulationCommand[]> {
    return [...this.commands.values()].sort((left, right) => left.queuedAt - right.queuedAt);
  }
}
