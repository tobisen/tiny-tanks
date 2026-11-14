import { describe, expect, it } from "vitest";
import {
  CRATES,
  DEFAULT_SETTINGS,
  quickPlaySettings,
  WORLD,
} from "../game/config";
import { placeCrates } from "../game/crates";
import { Match, type Projectile } from "../game/match";
import { sweep } from "../game/physics";
import {
  ACHIEVEMENTS,
  accuracy,
  emptyRecord,
  readRecord,
  resultFor,
  updateRecord,
  type PlayerResult,
} from "../game/records";
import { WEAPONS } from "../game/weapons";
import { chooseShot } from "../game/ai";

function chainMatch(count = 3): Match {
  const game = new Match({ ...DEFAULT_SETTINGS, players: 2, wind: false }, 123);
  game.terrain.heights.fill(450);
  for (const tank of game.tanks) tank.y = 450;
  game.crates = Array.from({ length: count }, (_, id) => ({
    id,
    x: 500 + id * (count > 8 ? 3 : 60),
    y: 450,
    active: true,
  }));
  game.tanks[1].x = 680;
  game.tanks[0].shots = 1;
  const p: Projectile = {
    id: 1,
    x: 500,
    y: 400,
    vx: 0,
    vy: 220,
    owner: 0,
    weapon: "standard",
    age: 1,
    child: false,
    penetration: 0,
    previousX: 500,
    previousY: 400,
    shot: 1,
  };
  game.projectiles = [p];
  game.phase = "flight";
  return game;
}
function resolve(game: Match): void {
  for (
    let i = 0;
    i < 3000 && (game.phase === "flight" || game.phase === "settle");
    i++
  )
    game.tick();
}
const result = (overrides: Partial<PlayerResult> = {}): PlayerResult => ({
  won: false,
  draw: false,
  damage: 0,
  shots: 3,
  hits: 0,
  kills: 0,
  biggestHit: 0,
  longestChain: 0,
  comeback: false,
  ...overrides,
});

describe("explosive crates", () => {
  it("places 1–3 deterministic crates clear of tanks and each other across seeds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const game = new Match(
        { ...DEFAULT_SETTINGS, players: (seed % 3) + 2 },
        seed,
      );
      expect(game.crates).toEqual(placeCrates(seed, game.terrain, game.tanks));
      expect(game.crates.length).toBeGreaterThanOrEqual(1);
      expect(game.crates.length).toBeLessThanOrEqual(3);
      for (const crate of game.crates) {
        expect(
          game.tanks.every(
            (t) => Math.abs(t.x - crate.x) >= CRATES.spawnClearance,
          ),
        ).toBe(true);
        expect(crate.y).toBe(game.terrain.at(crate.x));
        expect(
          game.crates
            .filter((c) => c.id !== crate.id)
            .every((c) => Math.abs(c.x - crate.x) > 48),
        ).toBe(true);
      }
    }
  });
  it("can disable crates and keeps decorative collision optional", () => {
    const game = new Match({ ...DEFAULT_SETTINGS, crates: false }, 1);
    expect(game.crates).toEqual([]);
  });
  it("detects a swept hit on the crate before the ground", () => {
    const g = chainMatch();
    const hit = sweep(
      { x: 450, y: 440, vx: 0, vy: 0 },
      { x: 550, y: 440, vx: 0, vy: 0 },
      g.terrain,
      [],
      -1,
      g.crates,
    );
    expect(hit?.crate).toBe(0);
    expect(hit?.terrain).toBe(false);
  });
  it("resolves multi-crate chains deterministically with real damage and craters", () => {
    const a = chainMatch(),
      b = chainMatch();
    resolve(a);
    resolve(b);
    expect(a.longestChain).toBe(3);
    expect(a.crates.every((c) => !c.active)).toBe(true);
    expect(a.tanks[1].health).toBeLessThan(100);
    expect(a.terrain.at(560)).toBeGreaterThan(450);
    expect(a.terrain.heights).toEqual(b.terrain.heights);
    expect(a.events).toEqual(b.events);
    expect(a.events.filter((e) => e.type === "crate")).toHaveLength(3);
  });
  it("terminates even an adversarial cluster at the configured bound", () => {
    const game = chainMatch(30);
    resolve(game);
    expect(game.events.filter((e) => e.type === "crate")).toHaveLength(
      CRATES.maxChain,
    );
    expect(game.longestChain).toBe(CRATES.maxChain);
    expect(game.phase).not.toBe("flight");
    expect(game.events.length).toBeLessThan(100);
  });
  it("makes a crate at its safe spawn clearance useful without an instant defeat", () => {
    const game = chainMatch(1);
    game.tanks[1].x = 500 + CRATES.spawnClearance;
    resolve(game);
    expect(game.tanks[1].health).toBeLessThan(85);
    expect(game.tanks[1].health).toBeGreaterThan(0);
  });
  it("attributes all chain damage to the firing tank and counts one accurate shot", () => {
    const game = chainMatch();
    resolve(game);
    expect(game.tanks[0].hits).toBe(1);
    expect(game.tanks[0].damage).toBe(100 - game.tanks[1].health);
    expect(game.tanks[0].longestChain).toBe(3);
    expect(accuracy(game.tanks[0])).toBe(100);
  });
});
describe("records and achievements from gameplay", () => {
  it("counts wins/losses/draws and actual damage with immutable aggregation", () => {
    const previous = emptyRecord();
    const a = updateRecord(
      previous,
      result({ won: true, damage: 140, hits: 2, biggestHit: 70 }),
    ).record;
    expect(previous.matches).toBe(0);
    expect(a).toMatchObject({
      matches: 1,
      wins: 1,
      losses: 0,
      damage: 140,
      bestAccuracy: 67,
      biggestHit: 70,
    });
    const b = updateRecord(a, result()).record;
    const c = updateRecord(b, result({ draw: true })).record;
    expect(c).toMatchObject({
      matches: 3,
      wins: 1,
      losses: 1,
      draws: 1,
      damage: 140,
    });
  });
  it("does not reward self hits or misses as accuracy", () => {
    const game = new Match(
      { ...DEFAULT_SETTINGS, crates: false, players: 2, wind: false },
      1,
    );
    game.current.angle = 90;
    game.current.power = 20;
    game.fire();
    resolve(game);
    expect(game.tanks[0].hits).toBe(0);
    expect(accuracy(game.tanks[0])).toBe(0);
    expect(accuracy({ shots: 0, hits: 0 })).toBe(0);
  });
  it("unlocks exactly the five achievements when their real conditions are met", () => {
    const { record, unlocked } = updateRecord(
      emptyRecord(),
      result({
        won: true,
        damage: 500,
        shots: 4,
        hits: 3,
        biggestHit: 100,
        longestChain: 3,
        comeback: true,
      }),
    );
    expect(unlocked).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(updateRecord(record, result({ won: true })).unlocked).toEqual([]);
  });
  it("rejects easy-to-fake sharpshooter and comeback conditions", () => {
    const { record } = updateRecord(
      emptyRecord(),
      result({ shots: 1, hits: 1, damage: 20 }),
    );
    expect(record.achievements).toEqual([]);
    expect(
      updateRecord(emptyRecord(), result({ shots: 4, hits: 2 })).record
        .achievements,
    ).not.toContain("sharpshooter");
  });
  it("reads corrupted storage safely and round-trips valid records", () => {
    expect(readRecord("bad-json")).toEqual(emptyRecord());
    expect(
      readRecord(
        '{"wins":-9,"bestAccuracy":999,"damage":"bad","achievements":["fake","first-victory"]}',
      ),
    ).toMatchObject({
      wins: 0,
      bestAccuracy: 100,
      damage: 0,
      achievements: ["first-victory"],
    });
    const r = updateRecord(emptyRecord(), result({ won: true })).record;
    expect(readRecord(JSON.stringify(r))).toEqual(r);
  });
  it("builds the result from actual tank counters and winner state", () => {
    const game = chainMatch();
    resolve(game);
    game.winnerId = 0;
    game.tanks[0].lowHealth = true;
    expect(resultFor(game)).toMatchObject({
      won: true,
      damage: game.tanks[0].damage,
      hits: 1,
      longestChain: 3,
      comeback: true,
    });
  });
});
describe("arcade balance, Quick Play and AI", () => {
  it("Quick Play is one human vs two Normal opponents with wind and crates, preserving only comfort preferences", () => {
    const settings = quickPlaySettings(() => 0.8, {
      mode: "local",
      players: 4,
      health: 150,
      difficulty: "hard",
      wind: false,
      crates: false,
      reducedMotion: true,
      preview: false,
      inputSpeed: "precise",
    });
    expect(settings).toMatchObject({
      mode: "ai",
      players: 3,
      difficulty: "normal",
      health: 100,
      wind: true,
      crates: true,
      theme: "moon",
      preview: false,
      reducedMotion: true,
      inputSpeed: "precise",
    });
    expect(quickPlaySettings(() => 0).theme).toBe("green");
    expect(quickPlaySettings(() => 0.4).theme).toBe("desert");
  });
  it("weapon strengths, speeds, ammo and radii stay within useful balance bounds", () => {
    for (const w of WEAPONS) {
      expect(w.damage).toBeGreaterThan(15);
      expect(w.radius).toBeGreaterThan(25);
      expect(w.radius).toBeLessThanOrEqual(110);
      expect(w.speed).toBeGreaterThanOrEqual(0.8);
      expect(w.speed).toBeLessThanOrEqual(1.1);
      expect(w.ammo).toBeGreaterThan(0);
    }
    expect(WEAPONS.find((w) => w.id === "mega")!.radius).toBeGreaterThan(
      WEAPONS.find((w) => w.id === "heavy")!.radius,
    );
    expect(WEAPONS.find((w) => w.id === "standard")!.ammo).toBe(Infinity);
  });
  it("AI finds valid shots when terrain and crates change and special ammunition is exhausted", () => {
    const game = chainMatch();
    game.phase = "aim";
    for (const w of WEAPONS)
      if (w.id !== "standard") game.current.ammo[w.id] = 0;
    const shot = chooseShot(game);
    expect(shot.weapon).toBe("standard");
    expect(shot.angle).toBeGreaterThanOrEqual(0);
    expect(shot.angle).toBeLessThanOrEqual(180);
    expect(shot.power).toBeGreaterThanOrEqual(0);
    expect(shot.power).toBeLessThanOrEqual(100);
    Object.assign(game.current, shot);
    expect(game.fire()).toBe(true);
    resolve(game);
    if (game.winnerId !== undefined) expect(game.winnerId).toBe(0);
    else expect(game.turn).toBe(2);
  });
  it("duration counts active simulation time and stops after results", () => {
    const game = chainMatch();
    game.tick();
    expect(game.elapsed).toBe(WORLD.step);
    game.phase = "over";
    game.tick();
    expect(game.elapsed).toBe(WORLD.step);
  });
});
