// Drafts for communities where games are NOT normally posted. The rule for
// all of them: the post must be native content for that sub (a chart, a map,
// a technique, a design question), and the game is only the source. No play
// link in the post body; answer with it when someone asks.
// Pure: takes the GET /api/activity payload, returns markdown + CSV text.

const isAi = (id) => typeof id === "string" && id.startsWith("ai-");
const isBarbarian = (id) => typeof id === "string" && id.startsWith("barbarian-");

// The activity feed has shown net24h far larger than tilesGained24h (e.g.
// 47,356 net from 475 gained). Never quote a momentum row that can't be
// true; a public chart with an impossible number sinks the whole post.
export const plausibleMomentum = (row) => row && Number.isFinite(row.net24h) && Math.abs(row.net24h) <= (row.tilesGained24h ?? 0) + (row.tilesLost24h ?? 0);

export const summariseActivity = (activity) => {
  const ranked = (activity?.powerScore ?? []).filter((p) => !isBarbarian(p.id));
  const aiCount = ranked.filter((p) => isAi(p.id)).length;
  const topHuman = [...ranked].sort((a, b) => a.rank - b.rank).find((p) => !isAi(p.id));
  const wars = [...(activity?.wars ?? [])].sort((a, b) => b.tileFlips24h - a.tileFlips24h);
  return {
    empires: ranked.length,
    aiCount,
    humanCount: ranked.length - aiCount,
    topIsAi: ranked.some((p) => p.rank === 1 && isAi(p.id)),
    topHumanRank: topHuman?.rank,
    activeTruces: (activity?.truceWatch ?? []).length,
    warCount: wars.length,
    topWar: wars[0],
    manpowerLost24h: activity?.manpowerLost24h ?? 0,
    droppedMomentumRows: (activity?.territoryMomentum ?? []).filter((row) => !plausibleMomentum(row)).length
  };
};

export const warsCsv = (activity) =>
  ["war,tile_flips_24h,tiles_contested_24h", ...[...(activity?.wars ?? [])].sort((a, b) => b.tileFlips24h - a.tileFlips24h).map((w) => `"${w.playerAName} vs ${w.playerBName}",${w.tileFlips24h},${w.tilesContested24h}`)].join("\n");

export const powerCsv = (activity) =>
  ["empire,kind,rank,tiles,score", ...(activity?.powerScore ?? []).filter((p) => !isBarbarian(p.id)).sort((a, b) => a.rank - b.rank).map((p) => `"${p.name}",${isAi(p.id) ? "ai" : "human"},${p.rank},${p.tiles},${p.score}`)].join("\n");

export const buildNicheDraft = (activity, link) => {
  const s = summariseActivity(activity);
  const war = s.topWar ? `${s.topWar.playerAName} vs ${s.topWar.playerBName}: ${s.topWar.tileFlips24h} tile flips in 24 h over ${s.topWar.tilesContested24h} contested tiles` : "<no war data today>";
  const aiLine = s.empires ? `${s.aiCount} of ${s.empires} ranked empires are AI${s.topIsAi ? ", and an AI holds rank 1" : ""}${s.topHumanRank ? ` (best human: rank ${s.topHumanRank})` : ""}` : "<no ranking data today>";
  return `# Niche communities (where nobody else posts games)

Rule for every one of these: the post is native content for that sub, and the
game is only the source. No play link in the body. Reply with it when asked:
${link}
Read each sidebar first. Rules below were not verified against live sidebars.

Today's real numbers (from /api/activity):
- ${aiLine}
- Biggest war: ${war}
- ${s.activeTruces} active truces, ${s.warCount} wars, ${s.manpowerLost24h} manpower lost in 24 h
${s.droppedMomentumRows ? `- ${s.droppedMomentumRows} territory-momentum rows dropped as implausible (net > gained + lost). Don't quote "fastest expansion" until that's fixed.\n` : ""}
## r/dataisbeautiful: [OC] chart
Chart wars.csv or power.csv (written next to this file). Title like
"[OC] One day of border wars in a live strategy game: tile flips per war".
Cite the source + tool in the required comment.

## r/singularity, r/accelerate, r/artificial: capability data point
"${aiLine}." Frame it as a question: what does it mean when scripted AI
empires outplay most humans in a live game? Be exact: the in-game AI is a
deterministic planner, not an LLM (LLMs only label training data offline).

## r/GameTheory, r/diplomacy (the board game): betrayal and truces
${s.activeTruces} truces are running right now. Ask: should a game let you break
a truce, and what should it cost? Share real outcomes, not the pitch.

## r/proceduralgeneration, r/threejs, r/webgl: technique write-up
One technique with images: toroidal island worldgen, the river remake, or the
true-3D tile renderer with its 2D fallback. Link the game as the live demo, at the end.

## r/worldbuilding, r/imaginarymaps: the world, not the game
A world-bible excerpt (Houses, Coin, Manifests) or a season-end map of
empires' borders presented as a map. Check that game screenshots are allowed first.

## r/sweden (or any local sub) + local press: "local dev builds..."
A short human story. Local subs rarely see game posts.
`;
};
