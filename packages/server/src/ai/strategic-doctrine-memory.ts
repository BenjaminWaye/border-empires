import type { AiDoctrineDecision, AiRewriteContext } from "./rewrite-types.js";
import { chooseAiStrategicDoctrine, doctrineInvalidationSignature } from "./strategic-doctrine.js";

export const AI_DOCTRINE_REEVALUATE_MS = 15_000;
export const AI_DOCTRINE_REPIVOT_MARGIN = 12;

export type AiDoctrineMemory = {
  decision: AiDoctrineDecision;
  signature: string;
  updatedAt: number;
};

type ResolveAiDoctrineResult = {
  decision: AiDoctrineDecision;
  memory: AiDoctrineMemory;
  reusedExisting: boolean;
};

export const resolveAiDoctrine = (
  ctx: AiRewriteContext,
  nowMs: number,
  existing?: AiDoctrineMemory
): ResolveAiDoctrineResult => {
  const signature = doctrineInvalidationSignature(ctx);
  if (existing && existing.signature === signature && nowMs - existing.updatedAt < AI_DOCTRINE_REEVALUATE_MS) {
    return {
      decision: existing.decision,
      memory: existing,
      reusedExisting: true
    };
  }

  const candidate = chooseAiStrategicDoctrine(ctx, existing?.decision.doctrineId);
  if (existing) {
    const currentScore = candidate.options.find((option) => option.id === existing.decision.doctrineId)?.score ?? Number.NEGATIVE_INFINITY;
    const nextScore = candidate.options[0]?.score ?? Number.NEGATIVE_INFINITY;
    if (signature !== existing.signature && nextScore < currentScore + AI_DOCTRINE_REPIVOT_MARGIN) {
      const retained: AiDoctrineMemory = {
        decision: existing.decision,
        signature,
        updatedAt: nowMs
      };
      return {
        decision: retained.decision,
        memory: retained,
        reusedExisting: true
      };
    }
  }

  const memory: AiDoctrineMemory = {
    decision: candidate,
    signature,
    updatedAt: nowMs
  };
  return {
    decision: candidate,
    memory,
    reusedExisting: false
  };
};
