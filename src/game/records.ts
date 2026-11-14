import type { Match, Tank } from "./match";
export const ACHIEVEMENTS = [
  {
    id: "first-victory",
    name: "First Victory",
    description: "Win a match as Clover.",
  },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    description: "Finish a match with at least 3 shots and 75% accuracy.",
  },
  {
    id: "chain-reaction",
    name: "Chain Reaction",
    description: "Detonate two or more crates in one chain.",
  },
  {
    id: "demolition-expert",
    name: "Demolition Expert",
    description: "Deal 500 total damage to opponents.",
  },
  {
    id: "comeback-victory",
    name: "Comeback Victory",
    description: "Win after surviving at 25% health or less.",
  },
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"];
export interface ArcadeRecord {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  damage: number;
  bestAccuracy: number;
  biggestHit: number;
  longestChain: number;
  achievements: AchievementId[];
}
export interface PlayerResult {
  won: boolean;
  draw: boolean;
  damage: number;
  shots: number;
  hits: number;
  kills: number;
  biggestHit: number;
  longestChain: number;
  comeback: boolean;
}
export const RECORD_KEY = "tiny-tanks-record-v2";
export const accuracy = (tank: Pick<Tank, "shots" | "hits">): number =>
  tank.shots ? Math.min(100, Math.round((tank.hits / tank.shots) * 100)) : 0;
export function emptyRecord(): ArcadeRecord {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    damage: 0,
    bestAccuracy: 0,
    biggestHit: 0,
    longestChain: 0,
    achievements: [],
  };
}
export function resultFor(match: Match, player = 0): PlayerResult {
  const t = match.tanks[player];
  return {
    won: match.winnerId === t.id,
    draw: match.winnerId === undefined,
    damage: t.damage,
    shots: t.shots,
    hits: t.hits,
    kills: t.kills,
    biggestHit: t.biggestHit,
    longestChain: t.longestChain,
    comeback: match.winnerId === t.id && t.lowHealth,
  };
}
export function updateRecord(
  previous: ArcadeRecord,
  result: PlayerResult,
): { record: ArcadeRecord; unlocked: AchievementId[] } {
  const percent = accuracy(result),
    record: ArcadeRecord = {
      ...previous,
      matches: previous.matches + 1,
      wins: previous.wins + Number(result.won),
      losses: previous.losses + Number(!result.won && !result.draw),
      draws: previous.draws + Number(result.draw),
      damage: previous.damage + result.damage,
      bestAccuracy: Math.max(previous.bestAccuracy, percent),
      biggestHit: Math.max(previous.biggestHit, result.biggestHit),
      longestChain: Math.max(previous.longestChain, result.longestChain),
      achievements: [...previous.achievements],
    };
  const conditions: Record<AchievementId, boolean> = {
    "first-victory": result.won,
    sharpshooter: result.shots >= 3 && result.hits / result.shots >= 0.75,
    "chain-reaction": result.longestChain >= 2,
    "demolition-expert": record.damage >= 500,
    "comeback-victory": result.comeback,
  };
  const unlocked = ACHIEVEMENTS.filter(
    (a) => conditions[a.id] && !record.achievements.includes(a.id),
  ).map((a) => a.id);
  record.achievements.push(...unlocked);
  return { record, unlocked };
}
export function readRecord(raw: string | null): ArcadeRecord {
  const base = emptyRecord();
  try {
    const saved = JSON.parse(raw ?? "null") as Partial<ArcadeRecord> | null;
    if (!saved || typeof saved !== "object") return base;
    for (const key of [
      "matches",
      "wins",
      "losses",
      "draws",
      "damage",
      "bestAccuracy",
      "biggestHit",
      "longestChain",
    ] as const)
      if (
        typeof saved[key] === "number" &&
        Number.isFinite(saved[key]) &&
        saved[key] >= 0
      )
        base[key] = Math.floor(saved[key]);
    base.bestAccuracy = Math.min(100, base.bestAccuracy);
    base.achievements = ACHIEVEMENTS.filter(
      (a) =>
        Array.isArray(saved.achievements) && saved.achievements.includes(a.id),
    ).map((a) => a.id);
  } catch {
    /* Missing, blocked, or corrupt storage never prevents a game. */
  }
  return base;
}
export const formatDuration = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
