export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const canToggleFogForEmail = (email: string | undefined, adminEmail: string | undefined): boolean => {
  const normalized = (email ?? "").trim().toLowerCase();
  const target = (adminEmail ?? "").trim().toLowerCase();
  return normalized.length > 0 && target.length > 0 && normalized === target;
};

export const seasonalDefaultAiPlayerIds = (aiPlayerCount?: number): string[] =>
  Array.from({ length: aiPlayerCount ?? 20 }, (_, index) => `ai-${index + 1}`);
