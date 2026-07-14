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
  loadRecoverableCommands(): Promise<StoredSimulationCommand[]>;
  loadAllCommands(): Promise<StoredSimulationCommand[]>;
  /**
   * Highest ever-persisted client_seq per player, regardless of status AND
   * regardless of whether the underlying commands row still exists. Used to
   * seed each command producer's next-seq counter on boot so reissued seqs
   * can't collide with resolved/rejected rows still in the commands table.
   * Deliberately distinct from loadRecoverableCommands (which excludes
   * RESOLVED/REJECTED and would understate the true high-water mark).
   * Backed by a durable watermark updated on every insert (not a MAX() scan
   * over commands), so it stays correct after RESOLVED/REJECTED rows are
   * removed by retention pruning.
   */
  loadMaxClientSeqByPlayer(): Promise<Record<string, number>>;
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

  async loadRecoverableCommands(): Promise<StoredSimulationCommand[]> {
    return [...this.commands.values()]
      .filter((command) => command.status === "QUEUED" || command.status === "ACCEPTED")
      .sort((left, right) => left.queuedAt - right.queuedAt);
  }

  async loadAllCommands(): Promise<StoredSimulationCommand[]> {
    return [...this.commands.values()].sort((left, right) => left.queuedAt - right.queuedAt);
  }

  async loadMaxClientSeqByPlayer(): Promise<Record<string, number>> {
    const maxByPlayer: Record<string, number> = {};
    for (const command of this.commands.values()) {
      const current = maxByPlayer[command.playerId] ?? 0;
      if (command.clientSeq > current) maxByPlayer[command.playerId] = command.clientSeq;
    }
    return maxByPlayer;
  }
}
