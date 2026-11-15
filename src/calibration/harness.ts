import {
  DEFAULT_SETTINGS,
  type Difficulty,
  type ThemeId,
} from "../game/config";
import { Match, type ShotIntent, type ShotOutcome } from "../game/match";
import { placeCrates } from "../game/crates";
import { WEAPONS, type WeaponId } from "../game/weapons";
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
export interface CalibrationShot {
  angle: number;
  power: number;
  weapon: WeaponId;
  intent?: ShotIntent;
  correctionApplied?: boolean;
  evaluations?: number;
}
export type Planner = (match: Match) => CalibrationShot;
export function scenario(index: number, difficulty: Difficulty): Match {
  const theme: ThemeId = (["green", "desert", "moon"] as const)[index % 3];
  const distance = [220, 500, 900][Math.floor(index / 3) % 3];
  const wind = [-18, 0, 18][Math.floor(index / 9) % 3];
  const mirror = Math.floor(index / 27) % 2;
  const standardOnly = Math.floor(index / 54) % 2 === 0;
  const crates = Math.floor(index / 108) % 2 === 1;
  const health = Math.floor(index / 216) % 2 ? 45 : 100;
  const game = new Match(
    {
      ...DEFAULT_SETTINGS,
      players: 2,
      difficulty,
      theme,
      crates,
      wind: wind !== 0,
    },
    70001 + index * 97,
  );
  game.tanks[0].x = 190;
  game.tanks[1].x = 190 + distance;
  for (const t of game.tanks) {
    t.y = game.terrain.at(t.x);
    if (standardOnly)
      for (const w of WEAPONS) if (w.id !== "standard") t.ammo[w.id] = 0;
  }
  game.active = mirror;
  game.tanks[1 - mirror].health = health;
  game.wind = wind;
  game.crates = crates ? placeCrates(game.seed, game.terrain, game.tanks) : [];
  return game;
}
export function resolveShot(game: Match): ShotOutcome {
  let ticks = 0;
  while ((game.phase === "flight" || game.phase === "settle") && ticks++ < 2500)
    game.tick();
  if (ticks >= 2500 || !game.shotHistory.length)
    throw new Error("Shot did not resolve");
  game.events.length = 0;
  return game.shotHistory[game.shotHistory.length - 1];
}
export function execute(game: Match, shot: CalibrationShot): ShotOutcome {
  game.current.angle = shot.angle;
  game.current.power = shot.power;
  game.current.weapon = shot.weapon;
  if (!game.fire(shot.intent))
    throw new Error("Planner produced an illegal shot");
  return resolveShot(game);
}
export function shotMetrics(shot: ShotOutcome): {
  direct: boolean;
  near: boolean;
  miss: number;
  damage: number;
} {
  const direct = shot.impacts.some(
    (i) => i.direct !== undefined && i.direct !== shot.owner,
  );
  const miss = direct
    ? 0
    : Math.min(
        ...shot.impacts.flatMap((i) =>
          shot.targets.map((t) => Math.hypot(i.x - t.x, i.y - (t.y - 7))),
        ),
      );
  return { direct, near: !direct && miss <= 60, miss, damage: shot.damage };
}
export function measure(planner: Planner, samples = 432) {
  const report = {} as Record<Difficulty, ReturnType<typeof measureDifficulty>>;
  for (const difficulty of DIFFICULTIES)
    report[difficulty] = measureDifficulty(planner, difficulty, samples);
  return report;
}
function measureDifficulty(
  planner: Planner,
  difficulty: Difficulty,
  samples: number,
) {
  let direct = 0,
    near = 0,
    miss = 0,
    damage = 0,
    splash = 0,
    needsCorrection = 0,
    corrections = 0;
  const times: number[] = [],
    weaponCounts = Object.fromEntries(WEAPONS.map((w) => [w.id, 0])) as Record<
      WeaponId,
      number
    >;
  const groups = {
    standardOnly: { shots: 0, direct: 0, damage: 0 },
    arsenal: { shots: 0, direct: 0, damage: 0 },
  };
  planner(scenario(0, difficulty));
  for (let i = 0; i < samples; i++) {
    const game = scenario(i, difficulty),
      start = performance.now(),
      shot = planner(game);
    times.push(performance.now() - start);
    const m = shotMetrics(execute(game, shot));
    direct += Number(m.direct);
    near += Number(m.near);
    miss += m.miss;
    damage += m.damage;
    splash += Number(!m.direct && m.damage > 0);
    needsCorrection += Number(!m.direct && m.miss > 40);
    corrections += Number(Boolean(shot.correctionApplied));
    weaponCounts[shot.weapon]++;
    const group =
      Math.floor(i / 54) % 2 === 0 ? groups.standardOnly : groups.arsenal;
    group.shots++;
    group.direct += Number(m.direct);
    group.damage += m.damage;
  }
  times.sort((a, b) => a - b);
  return {
    samples,
    directHits: direct,
    directRate: direct / samples,
    nearMissRate: near / samples,
    splashOnlyRate: splash / samples,
    averageMiss: miss / samples,
    averageDamage: damage / samples,
    shotsNeedingCorrection: needsCorrection,
    memoryCorrections: corrections,
    weaponCounts,
    groups,
    meanDecisionMs: times.reduce((a, b) => a + b, 0) / samples,
    p95DecisionMs: times[Math.floor(times.length * 0.95)],
  };
}
export function tournament(planner: Planner, games = 90) {
  const wins: Record<Difficulty, number> = { easy: 0, normal: 0, hard: 0 };
  let draws = 0,
    unresolved = 0,
    turns = 0,
    corrections = 0,
    decisions = 0;
  for (let i = 0; i < games; i++) {
    const game = new Match(
      {
        ...DEFAULT_SETTINGS,
        players: 3,
        theme: (["green", "desert", "moon"] as const)[Math.floor(i / 30) % 3],
        crates: i % 2 === 0,
      },
      90001 + Math.floor(i / 3) * 103,
    );
    const skills = game.tanks.map((t) => DIFFICULTIES[(t.id + (i % 3)) % 3]);
    for (let turn = 0; turn < 120 && game.phase !== "over"; turn++) {
      game.settings.difficulty = skills[game.active];
      const shot = planner(game);
      corrections += Number(Boolean(shot.correctionApplied));
      decisions++;
      execute(game, shot);
    }
    turns += game.turn;
    if (game.phase !== "over") unresolved++;
    else if (game.winnerId === undefined) draws++;
    else wins[skills[game.winnerId]]++;
  }
  return {
    games,
    wins,
    draws,
    unresolved,
    averageTurns: turns / games,
    memoryCorrections: corrections,
    decisions,
  };
}
function copyPosition(source: Match, withMemory: boolean): Match {
  const copy = new Match({ ...source.settings }, source.seed);
  copy.active = source.active;
  copy.turn = source.turn;
  copy.wind = source.wind;
  copy.terrain.heights.set(source.terrain.heights);
  copy.terrain.version = source.terrain.version;
  copy.tanks = structuredClone(source.tanks);
  copy.crates = structuredClone(source.crates);
  if (withMemory) copy.shotHistory.push(...structuredClone(source.shotHistory));
  return copy;
}
export function learningStudy(planner: Planner, samples = 108) {
  let eligible = 0,
    corrections = 0,
    withMemoryMiss = 0,
    withoutMemoryMiss = 0,
    improved = 0;
  for (let i = 0; i < samples; i++) {
    const game = scenario(i, "normal"),
      owner = game.active,
      first = execute(game, planner(game));
    if (game.phase === "over" || shotMetrics(first).direct) continue;
    game.active = owner;
    const remembered = copyPosition(game, true),
      fresh = copyPosition(game, false),
      next = planner(remembered),
      control = planner(fresh);
    if (!next.correctionApplied) continue;
    const a = shotMetrics(execute(remembered, next)),
      b = shotMetrics(execute(fresh, control));
    eligible++;
    corrections++;
    withMemoryMiss += a.miss;
    withoutMemoryMiss += b.miss;
    improved += Number(a.miss < b.miss);
  }
  return {
    attempts: samples,
    eligible,
    corrections,
    improved,
    averageMissWithMemory: eligible ? withMemoryMiss / eligible : 0,
    averageMissWithoutMemory: eligible ? withoutMemoryMiss / eligible : 0,
  };
}
