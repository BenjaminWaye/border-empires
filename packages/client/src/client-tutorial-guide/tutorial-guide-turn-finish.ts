// Copy for the guide's last step. Manpower is what pays for every action, so a
// player holding manpower at or above the cap (the landing reserve, a
// Waystation grant; the sim pays no batch while manpower >= cap) must be told
// to spend it, never to come back later: in the 2026-11 persona playtest
// players quit "with nothing to do" on 2,000-5,000 manpower after this step
// told them it "refills every 4 hours".
//
// Owner, 2026-11-24: lines over about six words go unread, so each sentence
// here stays at six words or fewer. The earlier list of things to spend
// manpower on is gone: the steps before this one already taught each of them.

export type GuideManpower = { current: number; cap: number };

const isAtOrOverCap = (m: GuideManpower | undefined): m is GuideManpower =>
  m !== undefined && Number.isFinite(m.current) && Number.isFinite(m.cap) && m.current >= m.cap;

const fmt = (n: number): string => Math.floor(n).toLocaleString("en-US");

// The title is a send-off, never a chore: Finish is the next action, so the
// card must not read as "do this first" (2026-11 playtest: "Spend your 2,447
// manpower" made Finish look premature).
export const turnFinishTitle = (): string => "That's the basics.";

export const turnFinishWhy = (manpower: GuideManpower | undefined): string =>
  isAtOrOverCap(manpower) ? `Spend your ${fmt(manpower.current)} manpower. No refill while full.` : "Manpower refills every 4 hours.";
