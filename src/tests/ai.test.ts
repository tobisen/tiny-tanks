import { describe, expect, it } from "vitest";
import { chooseShot, fireAIShot } from "../game/ai";
import { AI_SKILLS } from "../game/ai-config";
import { sampleTerrain, shotMemory } from "../game/ai-memory";
import { DEFAULT_SETTINGS, random, type Difficulty } from "../game/config";
import { Match, type ShotIntent } from "../game/match";
import { integrate, launch } from "../game/physics";
import { WEAPONS } from "../game/weapons";
import {
  execute,
  measure,
  resolveShot,
  scenario,
} from "../calibration/harness";

function practice(): Match {
  const game = new Match(
    {
      ...DEFAULT_SETTINGS,
      players: 2,
      health: 1000,
      wind: false,
      crates: false,
    },
    451,
  );
  game.terrain.heights.fill(450);
  game.tanks[0].x = 300;
  game.tanks[1].x = 700;
  for (const t of game.tanks) {
    t.y = 450;
    for (const w of WEAPONS) if (w.id !== "standard") t.ammo[w.id] = 0;
  }
  return game;
}
function observedMiss(): Match {
  const game = practice();
  game.current.angle = 45;
  game.current.power = 20;
  const intent: ShotIntent = {
    target: 1,
    estimatedWind: 0,
    intendedAngle: 45,
    intendedPower: 20,
    targetX: 700,
    targetY: 450,
    terrainSamples: sampleTerrain(game, 300, 700),
  };
  game.fire(intent);
  resolveShot(game);
  game.active = 0;
  return game;
}
describe("fair, independently configured AI skills", () => {
  it("differentiates perception, execution, budget, tactics and learning", () => {
    const { easy, normal, hard } = AI_SKILLS;
    expect(easy.aimErrorDegrees).toBeGreaterThan(normal.aimErrorDegrees);
    expect(normal.aimErrorDegrees).toBeGreaterThan(hard.aimErrorDegrees);
    expect(easy.powerErrorPercent).toBeGreaterThan(normal.powerErrorPercent);
    expect(normal.windEstimationError).toBeGreaterThan(
      hard.windEstimationError,
    );
    expect(easy.trajectorySearchBudget).toBeLessThan(
      normal.trajectorySearchBudget,
    );
    expect(normal.trajectorySearchBudget).toBeLessThan(
      hard.trajectorySearchBudget,
    );
    expect(easy.learningRate).toBeLessThan(normal.learningRate);
    expect(normal.memoryAccuracy).toBeLessThan(hard.memoryAccuracy);
    expect(easy.weaponWeights.standard).toBeGreaterThan(
      normal.weaponWeights.standard,
    );
  });
  it.each(["easy", "normal", "hard"] as Difficulty[])(
    "%s produces reproducible legal actions within a hard search budget",
    (difficulty) => {
      for (const index of [0, 7, 31, 120]) {
        const game = scenario(index, difficulty),
          before = JSON.stringify(game);
        const shot = chooseShot(game);
        expect(shot).toEqual(chooseShot(game));
        expect(JSON.stringify(game)).toBe(before);
        expect(shot.angle).toBeGreaterThanOrEqual(0);
        expect(shot.angle).toBeLessThanOrEqual(180);
        expect(shot.power).toBeGreaterThanOrEqual(0);
        expect(shot.power).toBeLessThanOrEqual(100);
        expect(shot.evaluations).toBeLessThanOrEqual(
          AI_SKILLS[difficulty].trajectorySearchBudget,
        );
        expect(game.current.ammo[shot.weapon]).toBeGreaterThan(0);
        expect(shot.intent.target).not.toBe(game.active);
        expect(game.tanks[shot.intent.target].health).toBeGreaterThan(0);
      }
    },
  );
  it.each(["easy", "normal", "hard"] as Difficulty[])(
    "%s respects ammunition even with only an unusual weapon left",
    (difficulty) => {
      const game = scenario(135, difficulty);
      for (const w of WEAPONS)
        game.current.ammo[w.id] = w.id === "triple" ? 1 : 0;
      const shot = chooseShot(game);
      expect(shot.weapon).toBe("triple");
      expect(fireAIShot(game, shot)).toBe(true);
      expect(game.current.ammo.triple).toBe(0);
    },
  );
  it("uses imperfect wind only for planning, with no fictitious wind when disabled", () => {
    const windy = scenario(19, "normal");
    windy.wind = 18;
    windy.settings.wind = true;
    const shot = chooseShot(windy);
    expect(shot.intent.estimatedWind).not.toBe(18);
    expect(windy.wind).toBe(18);
    windy.settings.wind = false;
    windy.wind = 0;
    expect(chooseShot(windy).intent.estimatedWind).toBe(0);
  });
  it("applies uncertainty once before launch and shares unmodified player physics", () => {
    const game = scenario(8, "normal"),
      shot = chooseShot(game);
    expect(
      Math.abs(shot.power - shot.intent.intendedPower) +
        Math.abs(shot.angle - shot.intent.intendedAngle),
    ).toBeGreaterThan(0.01);
    const expected = launch(
      game.current.x,
      game.current.y - 12,
      shot.angle,
      shot.power,
      WEAPONS.find((w) => w.id === shot.weapon)!.speed,
    );
    expect(fireAIShot(game, shot)).toBe(true);
    expect(game.projectiles[0].vx).toBeCloseTo(expected.vx, 10);
    expect(game.projectiles[0].vy).toBeCloseTo(expected.vy, 10);
    integrate(expected, 1 / 120, game.wind, game.gravity);
    game.tick();
    expect(game.projectiles[0].x).toBeCloseTo(expected.x, 10);
    expect(game.projectiles[0].y).toBeCloseTo(expected.y, 10);
  });
  it("gives no homing, damage, wind, ammo or collision advantage to AI flags or target metadata", () => {
    const ai = scenario(12, "normal"),
      human = scenario(12, "normal");
    ai.current.ai = true;
    human.current.ai = false;
    const shot = chooseShot(ai);
    expect(chooseShot(human)).toEqual(shot);
    const a = execute(ai, shot);
    const b = execute(human, {
      ...shot,
      intent: {
        ...shot.intent,
        target: 999,
        targetX: -5000,
        estimatedWind: 999,
      },
    });
    expect(a.impacts).toEqual(b.impacts);
    expect(a.damage).toBe(b.damage);
    expect(ai.terrain.heights).toEqual(human.terrain.heights);
    expect(ai.tanks.map((t) => [t.health, t.ammo])).toEqual(
      human.tanks.map((t) => [t.health, t.ammo]),
    );
  });
  it("never targets a destroyed opponent or lets a destroyed tank act", () => {
    const game = new Match({ ...DEFAULT_SETTINGS, players: 3 }, 2026);
    game.tanks[1].health = 0;
    const shot = chooseShot(game);
    expect(shot.intent.target).toBe(2);
    game.current.health = 0;
    expect(() => chooseShot(game)).toThrow();
    expect(fireAIShot(game, shot)).toBe(false);
    expect(game.fire()).toBe(false);
    expect(game.projectiles).toHaveLength(0);
  });
  it("treats humans and computers identically and considers both sides in free-for-all", () => {
    const counts = [0, 0, 0];
    for (let seed = 1; seed <= 120; seed++) {
      const game = new Match(
        { ...DEFAULT_SETTINGS, players: 3, wind: false, crates: false },
        seed,
      );
      game.terrain.heights.fill(450);
      game.tanks.forEach((t, i) => {
        t.x = 240 + i * 400;
        t.y = 450;
      });
      game.active = 1;
      const shot = chooseShot(game);
      counts[shot.intent.target]++;
      game.tanks.forEach((t) => (t.ai = !t.ai));
      expect(chooseShot(game)).toEqual(shot);
    }
    expect(counts[0]).toBeGreaterThan(35);
    expect(counts[2]).toBeGreaterThan(35);
  });
});
describe("observed shot memory and imperfect learning", () => {
  it("records actual launches and impacts, and corrects a short shot in the useful direction", () => {
    const game = observedMiss(),
      outcome = game.shotHistory[0];
    expect(outcome.owner).toBe(0);
    expect(outcome.angle).toBe(45);
    expect(outcome.impacts[0].x).toBeLessThan(700);
    const guide = shotMemory(
      game,
      game.tanks[1],
      "standard",
      0,
      AI_SKILLS.normal,
      random(1),
    );
    expect(guide?.correction).toBeGreaterThan(0);
    expect(guide?.power).toBeGreaterThan(20);
  });
  it("discounts changing wind and invalidates significant terrain or position changes", () => {
    const game = observedMiss();
    const stable = shotMemory(
      game,
      game.tanks[1],
      "standard",
      0,
      AI_SKILLS.normal,
      random(1),
    )!;
    const windy = shotMemory(
      game,
      game.tanks[1],
      "standard",
      18,
      AI_SKILLS.normal,
      random(1),
    )!;
    expect(windy.confidence).toBeLessThan(stable.confidence);
    game.tanks[1].y += 30;
    expect(
      shotMemory(
        game,
        game.tanks[1],
        "standard",
        0,
        AI_SKILLS.normal,
        random(1),
      ),
    ).toBeUndefined();
    game.tanks[1].y -= 30;
    game.terrain.heights.fill(600);
    expect(
      shotMemory(
        game,
        game.tanks[1],
        "standard",
        0,
        AI_SKILLS.normal,
        random(1),
      ),
    ).toBeUndefined();
  });
  it("is scoped to the match and never trains a destroyed tank", () => {
    const game = observedMiss();
    expect(game.shotHistory).toHaveLength(1);
    const fresh = practice();
    expect(fresh.shotHistory).toHaveLength(0);
    expect(
      shotMemory(
        fresh,
        fresh.tanks[1],
        "standard",
        0,
        AI_SKILLS.hard,
        random(1),
      ),
    ).toBeUndefined();
    game.current.health = 0;
    expect(
      shotMemory(game, game.tanks[1], "standard", 0, AI_SKILLS.hard, random(1)),
    ).toBeUndefined();
  });
  it("keeps fresh execution uncertainty even when shot memory is available", () => {
    const game = observedMiss(),
      withMemory = chooseShot(game),
      history = game.shotHistory.splice(0);
    const without = chooseShot(game);
    game.shotHistory.push(...history);
    expect(
      Math.abs(withMemory.angle - withMemory.intent.intendedAngle),
    ).toBeGreaterThan(0.01);
    expect(withMemory.angle - withMemory.intent.intendedAngle).toBeCloseTo(
      without.angle - without.intent.intendedAngle,
      8,
    );
    expect(withMemory.power - withMemory.intent.intendedPower).toBeCloseTo(
      without.power - without.intent.intendedPower,
      8,
    );
  });
});
describe("representative real-physics calibration guard", () => {
  it("keeps difficulties distinct, Normal fallible, and Hard below near-perfect accuracy", () => {
    const measured = measure(chooseShot, 216);
    expect(measured.easy.directRate).toBeLessThan(measured.normal.directRate);
    expect(measured.normal.directRate).toBeLessThan(measured.hard.directRate);
    expect(measured.normal.directRate).toBeGreaterThan(0.1);
    expect(measured.normal.directRate).toBeLessThan(0.34);
    expect(measured.hard.directRate).toBeLessThan(0.6);
    expect(measured.easy.averageDamage).toBeLessThan(
      measured.normal.averageDamage,
    );
    expect(measured.normal.averageDamage).toBeLessThan(
      measured.hard.averageDamage,
    );
  }, 20000);
});

describe("bounded Normal AI integration scenarios", () => {
  const seededMatch = () => new Match(
    {
      ...DEFAULT_SETTINGS,
      players: 2,
      difficulty: "normal",
      health: 75,
      wind: false,
      crates: false,
      theme: "green",
    },
    145,
  );

  function humanShot(game: Match, angle: number) {
    expect(game.active).toBe(0);
    game.current.angle = angle;
    game.current.power = 20;
    expect(game.fire()).toBe(true);
    resolveShot(game);
    return game.phase;
  }

  it("naturally misses and then directly damages an opponent in two exchanges", () => {
    const game = seededMatch();
    for (const [turn, damage] of [[2, 0], [4, 28.5]]) {
      humanShot(game, 45);
      expect(game.current.ai).toBe(true);
      const shot = chooseShot(game);
      expect(fireAIShot(game, shot)).toBe(true);
      const outcome = resolveShot(game);
      expect(outcome).toMatchObject({
        owner: 1,
        turn,
        damage,
        angle: shot.angle,
        power: shot.power,
        weapon: shot.weapon,
      });
      if (damage === 0) {
        expect(outcome.impacts.every((impact) => impact.direct === undefined))
          .toBe(true);
        expect(game.tanks.map((tank) => tank.health)).toEqual([75, 75]);
      } else {
        expect(outcome.impacts.some((impact) => impact.direct === 0)).toBe(true);
        expect(game.tanks.map((tank) => tank.health)).toEqual([46.5, 75]);
      }
      expect(game.phase).toBe("aim");
      expect(game.turn).toBe(turn + 1);
    }
    expect(game.shotHistory).toHaveLength(4);
  });

  it("bounds the browser victory fixture with real self hits and resets same-seed shot memory", () => {
    const game = seededMatch();
    let firstAI: ReturnType<typeof chooseShot> | undefined;
    let shots = 0;
    while (game.phase !== "over" && shots < 5) {
      const health = game.current.health;
      const phase = humanShot(game, 90);
      shots++;
      expect(game.tanks[0].health).toBeLessThan(health);
      if (phase === "over") break;
      const shot = chooseShot(game);
      firstAI ??= shot;
      execute(game, shot);
    }
    expect(game.phase).toBe("over");
    expect(game.winnerId).toBe(1);
    expect(game.tanks[0].health).toBe(0);
    expect(shots).toBeLessThanOrEqual(5);
    expect(game.shotHistory.length).toBeGreaterThan(1);

    const replay = new Match({ ...game.settings }, game.seed);
    expect(replay.shotHistory).toHaveLength(0);
    humanShot(replay, 90);
    expect(replay.shotHistory).toHaveLength(1);
    expect(chooseShot(replay)).toEqual(firstAI);
  });
});
