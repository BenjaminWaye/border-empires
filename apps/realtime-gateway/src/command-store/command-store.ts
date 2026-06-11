import type { CommandEnvelope } from "@border-empires/sim-protocol";

export type StoredGatewayCommandStatus = "QUEUED" | "ACCEPTED" | "REJECTED" | "RESOLVED";

export type StoredGatewayCommand = {
  commandId: string;
  sessionId: string;
  playerId: string;
  clientSeq: number;
  type: CommandEnvelope["type"];
  payloadJson: string;
  queuedAt: number;
  status: StoredGatewayCommandStatus;
  acceptedAt?: number;
  rejectedAt?: number;
  rejectedCode?: string;
  rejectedMessage?: string;
  resolvedAt?: number;
};

export type GatewayCommandStore = {
  persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<StoredGatewayCommand>;
  markAccepted(commandId: string, acceptedAt: number): Promise<void>;
  markRejected(commandId: string, rejectedAt: number, code: string, message: string): Promise<void>;
  markResolved(commandId: string, resolvedAt: number): Promise<void>;
  get(commandId: string): Promise<StoredGatewayCommand | undefined>;
  findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredGatewayCommand | undefined>;
  listUnresolvedForPlayer(playerId: string): Promise<StoredGatewayCommand[]>;
  nextClientSeqForPlayer(playerId: string): Promise<number>;
};

export class InMemoryGatewayCommandStore implements GatewayCommandStore {
  private readonly commands = new Map<string, StoredGatewayCommand>();
  private readonly commandIdsByPlayerSeq = new Map<string, string>();
  private readonly maxClientSeqByPlayer = new Map<string, number>();

  async persistQueuedCommand(command: CommandEnvelope, queuedAt: number): Promise<StoredGatewayCommand> {
    const playerSeqKey = `${command.playerId}:${command.clientSeq}`;
    const existingByCommandId = this.commands.get(command.commandId);
    if (existingByCommandId) return existingByCommandId;

    const existingCommandId = this.commandIdsByPlayerSeq.get(playerSeqKey);
    if (existingCommandId) {
      return this.commands.get(existingCommandId)!;
    }

    const storedCommand: StoredGatewayCommand = {
      commandId: command.commandId,
      sessionId: command.sessionId,
      playerId: command.playerId,
      clientSeq: command.clientSeq,
      type: command.type,
      payloadJson: command.payloadJson,
      queuedAt,
      status: "QUEUED"
    };
    this.commands.set(command.commandId, storedCommand);
    this.commandIdsByPlayerSeq.set(playerSeqKey, command.commandId);
    const previousMax = this.maxClientSeqByPlayer.get(command.playerId) ?? 0;
    if (command.clientSeq > previousMax) {
      this.maxClientSeqByPlayer.set(command.playerId, command.clientSeq);
    }
    return storedCommand;
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

  async get(commandId: string): Promise<StoredGatewayCommand | undefined> {
    return this.commands.get(commandId);
  }

  async findByPlayerSeq(playerId: string, clientSeq: number): Promise<StoredGatewayCommand | undefined> {
    const commandId = this.commandIdsByPlayerSeq.get(`${playerId}:${clientSeq}`);
    return commandId ? this.commands.get(commandId) : undefined;
  }

  async listUnresolvedForPlayer(playerId: string): Promise<StoredGatewayCommand[]> {
    return [...this.commands.values()]
      .filter((command) => command.playerId === playerId && command.status !== "REJECTED" && command.status !== "RESOLVED")
      .sort((left, right) => left.clientSeq - right.clientSeq);
  }

  async nextClientSeqForPlayer(playerId: string): Promise<number> {
    return (this.maxClientSeqByPlayer.get(playerId) ?? 0) + 1;
  }
}
