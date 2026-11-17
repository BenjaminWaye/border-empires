// Copy for the guide's last step. Manpower is what pays for every action, so a
// player holding manpower above the cap (the landing reserve, a Waystation
// grant) must be told to spend it, never to come back later: in the 2026-11
// persona playtest players quit "with nothing to do" on 2,000-5,000 manpower
// after this step told them it "refills every 4 hours".

export type GuideManpower = { current: number; cap: number };

const isOverCap = (m: GuideManpower | undefined): m is GuideManpower =>
  m !== undefined && Number.isFinite(m.current) && Number.isFinite(m.cap) && m.current > m.cap;

const fmt = (n: number): string => Math.floor(n).toLocaleString("en-US");

export const turnFinishTitle = (manpower: GuideManpower | undefined): string =>
  isOverCap(manpower) ? `That's the basics. Spend your ${fmt(manpower.current)} manpower.` : "That's the basics. Your manpower refills every 4 hours.";

export const turnFinishWhy = (manpower: GuideManpower | undefined, chronicleName: string): string =>
  isOverCap(manpower)
    ? `Expand, garrison, build and attack. No refill until you're under ${fmt(manpower.cap)}. The ${chronicleName} shows what happened while you were away.`
    : `Come back, spend it on expanding, garrisoning, building and attacking, and check the ${chronicleName} for what happened while you were away.`;
