import { describe, expect, it } from "vitest";
import { chooseShot, fireAIShot } from "../game/ai";
import { DEFAULT_SETTINGS, THEMES, WORLD, random } from "../game/config";
import { Match, nextLiving, winner } from "../game/match";
import { blastDamage, integrate, launch, sweep } from "../game/physics";
import { Terrain } from "../game/terrain";
import { consumeAmmo, createAmmo, WEAPONS } from "../game/weapons";

const match = () =>
  new Match({ ...DEFAULT_SETTINGS, players: 2, wind: false }, 421);
function resolve(game: Match): void {
  let ticks = 0;
  while (
    (game.phase === "flight" || game.phase === "settle") &&
    ticks++ < 10000
  )
    game.tick();
  expect(ticks).toBeLessThan(10000);
}
describe("deterministic projectile physics", () => {
  it("maps physical angles to intuitive directions", () => {
    expect(launch(0, 0, 0, 50).vx).toBeGreaterThan(0);
    expect(launch(0, 0, 180, 50).vx).toBeLessThan(0);
    expect(launch(0, 0, 90, 50).vy).toBeLessThan(0);
  });
  it("matches the analytical trajectory independent of integration rate", () => {
    const a = { x: 0, y: 0, vx: 100, vy: -100 },
      b = { ...a };
    for (let i = 0; i < 120; i++) integrate(a, 1 / 120, 12, 170);
    for (let i = 0; i < 30; i++) integrate(b, 1 / 30, 12, 170);
    expect(a.x).toBeCloseTo(106, 8);
    expect(a.y).toBeCloseTo(-15, 8);
    expect(a.x).toBeCloseTo(b.x, 8);
    expect(a.y).toBeCloseTo(b.y, 8);
  });
  it("wind bends shots in its own direction", () => {
    const a = launch(0, 0, 90, 70),
      b = { ...a };
    integrate(a, 2, -20, 170);
    integrate(b, 2, 20, 170);
    expect(a.x).toBeLessThan(b.x);
    expect(a.y).toEqual(b.y);
  });
  it("sweeps fast projectiles against terrain", () => {
    const terrain = new Terrain(1);
    const hit = sweep(
      { x: 200, y: 100, vx: 0, vy: 0 },
      { x: 200, y: 630, vx: 0, vy: 0 },
      terrain,
      [],
      -1,
    );
    expect(hit?.terrain).toBe(true);
    expect(hit!.y).toBeLessThan(terrain.at(200) + 2);
  });
  it("sweeps against tanks before reaching the ground", () => {
    const terrain = new Terrain(1);
    const hit = sweep(
      { x: 200, y: 100, vx: 0, vy: 0 },
      { x: 800, y: 100, vx: 0, vy: 0 },
      terrain,
      [{ id: 2, x: 450, y: 107, health: 100 }],
      -1,
    );
    expect(hit?.tank).toBe(2);
  });
});
describe("terrain and damage", () => {
  it("generates repeatable varied terrain", () => {
    expect(new Terrain(10).heights).toEqual(new Terrain(10).heights);
    expect(new Terrain(10).at(500)).not.toEqual(new Terrain(20).at(500));
  });
  it("cuts a circular crater without changing distant ground", () => {
    const t = new Terrain(42),
      y = t.at(300),
      far = t.at(700);
    t.crater(300, y, 50);
    expect(t.at(300)).toBeCloseTo(y + 50);
    expect(t.at(700)).toBe(far);
    expect(t.version).toBe(1);
  });
  it("never fills a previous crater or cuts beyond the floor", () => {
    const t = new Terrain(2);
    t.crater(600, 600, 120);
    const y = t.at(600);
    t.crater(600, 350, 15);
    expect(t.at(600)).toBeGreaterThanOrEqual(y);
    expect(t.at(600)).toBeLessThan(WORLD.height);
  });
  it("has distance falloff and stronger direct hits", () => {
    expect(blastDamage(0, 50, 40)).toBe(40);
    expect(blastDamage(25, 50, 40)).toBeLessThan(40);
    expect(blastDamage(100, 50, 40)).toBe(0);
    expect(blastDamage(0, 50, 40, true)).toBe(54);
  });
  it("damages, eliminates, settles and declares a winner after a real impact", () => {
    const g = match(),
      target = g.tanks[1];
    target.health = 20;
    g.phase = "flight";
    g.projectiles.push({
      id: 0,
      owner: 0,
      weapon: "mega",
      x: target.x,
      y: target.y - 60,
      vx: 0,
      vy: 200,
      age: 1,
      child: false,
      penetration: 0,
      previousX: target.x,
      previousY: target.y - 60,
    });
    const old = target.y;
    resolve(g);
    expect(target.health).toBe(0);
    expect(target.y).toBeGreaterThan(old);
    expect(g.winnerId).toBe(0);
    expect(g.phase).toBe("over");
    expect(g.events.some((e) => e.type === "damage")).toBe(true);
    expect(g.events.some((e) => e.type === "death")).toBe(true);
  });
});
describe("turn rules", () => {
  it("rotates in order and skips destroyed tanks", () => {
    const g = new Match({ ...DEFAULT_SETTINGS, players: 4 }, 1);
    expect(nextLiving(g.tanks, 0)).toBe(1);
    g.tanks[1].health = 0;
    expect(nextLiving(g.tanks, 0)).toBe(2);
    expect(nextLiving(g.tanks, 3)).toBe(0);
  });
  it("detects a sole winner and a draw correctly", () => {
    expect(
      winner([
        { id: 0, health: 0 },
        { id: 1, health: 20 },
      ]),
    ).toBe(1);
    expect(
      winner([
        { id: 0, health: 20 },
        { id: 1, health: 20 },
      ]),
    ).toBeUndefined();
    expect(
      winner([
        { id: 0, health: 0 },
        { id: 1, health: 0 },
      ]),
    ).toBeUndefined();
  });
  it("does not allow firing during a flight", () => {
    const g = match();
    expect(g.fire()).toBe(true);
    expect(g.fire()).toBe(false);
  });
  it("advances only after projectiles finish", () => {
    const g = match();
    g.current.angle = 90;
    g.current.power = 30;
    g.fire();
    expect(g.turn).toBe(1);
    resolve(g);
    expect(g.turn).toBe(2);
    expect(g.active).toBe(1);
  });
  it("keeps wind bounded, seeded, and optional", () => {
    const a = new Match(DEFAULT_SETTINGS, 14),
      b = new Match(DEFAULT_SETTINGS, 14);
    expect(a.wind).toBe(b.wind);
    expect(Math.abs(a.wind)).toBeLessThanOrEqual(WORLD.maxWind);
    expect(match().wind).toBe(0);
    expect(random(12)()).toBe(random(12)());
  });
});
describe("six weapon behaviors and ammunition", () => {
  it("preserves unlimited shells and rejects exhausted ammunition", () => {
    const ammo = createAmmo();
    for (let i = 0; i < 10; i++)
      expect(consumeAmmo(ammo, "standard")).toBe(true);
    expect(ammo.standard).toBe(Infinity);
    expect(consumeAmmo(ammo, "mega")).toBe(true);
    expect(consumeAmmo(ammo, "mega")).toBe(false);
    expect(ammo.mega).toBe(0);
  });
  it.each(WEAPONS)("$name completes a shot and deforms terrain", (weapon) => {
    const g = match();
    g.current.weapon = weapon.id;
    g.current.angle = 75;
    g.current.power = 25;
    expect(g.fire()).toBe(true);
    resolve(g);
    expect(g.terrain.version).toBeGreaterThan(0);
    expect(g.tanks[0].ammo[weapon.id]).toBe(
      Number.isFinite(weapon.ammo) ? weapon.ammo - 1 : Infinity,
    );
  });
  it("triple shot creates three independent projectiles", () => {
    const g = match();
    g.current.weapon = "triple";
    g.fire();
    expect(g.projectiles).toHaveLength(3);
    expect(new Set(g.projectiles.map((p) => p.vx)).size).toBe(3);
  });
  it("cluster bursts into five bomblets during descent", () => {
    const g = match();
    g.current.weapon = "cluster";
    g.current.angle = 90;
    g.current.power = 40;
    g.fire();
    let ticks = 0;
    while (!g.events.some((e) => e.type === "split") && ticks++ < 2000)
      g.tick();
    expect(g.projectiles).toHaveLength(5);
    expect(g.projectiles.every((p) => p.child)).toBe(true);
  });
  it("bunker shell penetrates before exploding", () => {
    const g = match();
    const x = 600,
      y = g.terrain.at(x);
    g.phase = "flight";
    g.projectiles.push({
      id: 1,
      owner: 0,
      weapon: "bunker",
      x,
      y: y - 1,
      vx: 0,
      vy: 200,
      age: 1,
      child: false,
      penetration: 0,
      previousX: x,
      previousY: y - 1,
    });
    resolve(g);
    const blast = g.events.find((e) => e.type === "blast");
    expect(blast?.type === "blast" && blast.y).toBeGreaterThan(y + 25);
  });
});
describe("AI and complete matches", () => {
  it.each(["easy", "normal", "hard"] as const)(
    "%s AI selects a valid reproducible shot",
    (difficulty) => {
      const g = match();
      g.settings.difficulty = difficulty;
      const shot = chooseShot(g);
      expect(shot).toEqual(chooseShot(g));
      expect(shot.angle).toBeGreaterThanOrEqual(0);
      expect(shot.angle).toBeLessThanOrEqual(180);
      expect(shot.power).toBeGreaterThanOrEqual(0);
      expect(shot.power).toBeLessThanOrEqual(100);
      expect(g.current.ammo[shot.weapon]).toBeGreaterThan(0);
    },
  );
  it.each(
    (Object.keys(THEMES) as (keyof typeof THEMES)[]).flatMap((theme) =>
      (["normal", "hard"] as const).map((difficulty) => ({ theme, difficulty })),
    ),
  )(
    "$difficulty AI damages and eliminates opponents in a full $theme match using real physics",
    ({ theme, difficulty }) => {
      const g = new Match(
        { ...DEFAULT_SETTINGS, players: 3, difficulty, theme },
        284,
      );
      let shots = 0;
      while (g.phase !== "over" && shots++ < 90) {
        fireAIShot(g, chooseShot(g));
        resolve(g);
      }
      expect(g.phase).toBe("over");
      expect(g.tanks.reduce((kills, tank) => kills + tank.kills, 0)).toBeGreaterThan(0);
      expect(g.tanks.filter((t) => t.health > 0).length).toBeLessThanOrEqual(1);
      expect(shots).toBeLessThan(90);
    },
    20000,
  );
});
