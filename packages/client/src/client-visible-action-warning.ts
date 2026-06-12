type FeedType = "combat" | "mission" | "error" | "info" | "alliance" | "tech";
type FeedSeverity = "info" | "success" | "warn" | "error";

export type VisibleActionWarningDeps = {
  pushFeed: (message: string, type?: FeedType, severity?: FeedSeverity) => void;
  showCaptureAlert?: (title: string, detail: string, tone?: "success" | "error" | "warn", manpowerLoss?: number) => void;
};

export const showVisibleActionWarning = (
  deps: VisibleActionWarningDeps,
  title: string,
  detail: string,
  type: FeedType = "combat"
): void => {
  deps.showCaptureAlert?.(title, detail, "warn");
  deps.pushFeed(detail, type, "warn");
};
