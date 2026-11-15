import { describe, expect, it } from "vitest";
import {
  BATTLEFIELDS,
  DEFAULT_SETTINGS,
  ENVIRONMENT,
  PROFILE_IDS,
  quickPlaySettings,
  SUPPLIES,
  WORLD,
} from "../game/config";
import { Match } from "../game/match";
import { Terrain } from "../game/terrain";
import { reachable, resetFuel, tankFloor } from "../game/movement";
import {
  availableSupply,
  collectSupplies,
  destroySupplies,
  restock,
  spawnSupply,
  tickSupplies,
  type SupplyDrop,
  type SupplyKind,
} from "../game/supplies";
import { chooseSupplyMove } from "../game/ai-movement";
import { scheduleEnvironment, tickEnvironment } from "../game/environment";
import { SurvivalRun, readSurvivalRecord } from "../game/survival";
import { chooseShot } from "../game/ai";
import { execute } from "../calibration/harness";
import { WEAPONS } from "../game/weapons";

function flat(seed = 145): Match {
  const g = new Match(
    { ...DEFAULT_SETTINGS, players: 2, wind: false, crates: false },
    seed,
  );
  g.terrain.heights.fill(450);
  g.tanks.forEach((t) => (t.y = 450));
  return g;
}
function drop(g: Match, kind: SupplyKind, x = g.current.x + 40): SupplyDrop {
  const d: SupplyDrop = {
    id: `${g.seed}:test:${g.supplies.length}`,
    kind,
    x,
    y: g.terrain.at(x),
    age: 1,
    state: "landed",
  };
  g.supplies.push(d);
  return d;
}
function moveTo(g: Match, x: number): void {
  for (let i = 0; i < 90 && Math.abs(g.current.x - x) > 1; i++)
    if (!g.move(x > g.current.x ? 1 : -1, 1 / 60)) break;
}
describe("battlefield geometry independent of visual theme", () => {
  it.each(PROFILE_IDS)(
    "%s has safe, separate spawns, local exits and deterministic heights",
    (profile) => {
      for (let seed = 1; seed <= 30; seed++) {
        for (const players of [2, 3, 4]) {
          const g = new Match({ ...DEFAULT_SETTINGS, profile, players }, seed);
          expect(g.terrain.heights).toEqual(
            new Match({ ...g.settings }, seed).terrain.heights,
          );
          for (const t of g.tanks) {
            expect(t.y).toBe(g.terrain.at(t.x));
            expect(t.health).toBe(100);
            expect(
              g.tanks.every(
                (other) => other.id === t.id || Math.abs(t.x - other.x) >= 32,
              ),
            ).toBe(true);
            const left = reachable(t, t.x - 32, g.terrain, g.tanks, g.settings);
            const right = reachable(
              t,
              t.x + 32,
              g.terrain,
              g.tanks,
              g.settings,
            );
            expect(left || right).toBeDefined();
          }
          expect(Math.min(...g.terrain.heights)).toBeGreaterThanOrEqual(230);
          expect(Math.max(...g.terrain.heights)).toBeLessThan(550);
        }
      }
    },
  );
  it("Quick Play selects all four profiles and enables the Mayhem rules", () => {
    const profiles = [0, 0.3, 0.6, 0.9].map((value) =>
      quickPlaySettings(() => value),
    );
    expect(new Set(profiles.map((settings) => settings.profile)).size).toBe(4);
    for (const settings of profiles)
      expect(settings).toMatchObject({
        mode: "ai",
        players: 3,
        difficulty: "normal",
        movement: true,
        supplies: true,
        environmentalEvents: true,
        wind: true,
        crates: true,
      });
  });
  it("separates geometry from theme, and gives each profile a distinct silhouette", () => {
    const silhouettes = PROFILE_IDS.map((profile) =>
      new Terrain(15, profile).heights.join(","),
    );
    expect(new Set(silhouettes).size).toBe(4);
    const green = new Match({ ...DEFAULT_SETTINGS, profile: "ridge" }, 12);
    const desert = new Match({ ...green.settings, theme: "desert" }, 12);
    expect(green.terrain.heights).toEqual(desert.terrain.heights);
    expect(Object.keys(BATTLEFIELDS)).toHaveLength(4);
  });
});
describe("one movement and fuel rule for all tanks", () => {
  it("charges actual distance, respects the final partial fuel step, and never crosses an obstacle", () => {
    const g = flat();
    const t = g.current;
    const x = t.x;
    t.fuel = 5;
    expect(g.move(1, 1)).toBe(true);
    expect(t.x).toBe(x + 5);
    expect(t.fuel).toBe(0);
    expect(g.move(1, 1)).toBe(false);
    resetFuel(t);
    g.tanks[1].x = t.x + 40;
    g.move(1, 1);
    expect(g.tanks[1].x - t.x).toBeGreaterThanOrEqual(32);
  });
  it("blocks steep terrain, map boundaries, dead tanks, and movement during flight", () => {
    const g = flat();
    const x = g.current.x;
    for (let i = x + 1; i < x + 100; i++)
      g.terrain.heights[i] = 450 - (i - x) * 2;
    expect(g.move(1, 1 / 60)).toBe(false);
    g.terrain.heights.fill(450);
    g.current.x = 16;
    expect(g.move(-1)).toBe(false);
    g.current.health = 0;
    expect(g.move(1)).toBe(false);
    g.current.health = 100;
    g.fire();
    expect(g.move(1)).toBe(false);
  });
  it("keeps human and AI movement identical and bounded for a large time step", () => {
    const a = flat(),
      b = flat();
    b.current.ai = true;
    a.move(1, 10);
    b.move(1, 10);
    expect(a.current.x).toBe(b.current.x);
    expect(a.current.fuel).toBe(b.current.fuel);
    expect(a.current.x).toBe(135 + WORLD.moveFuel);
  });
});
describe("tactical supplies", () => {
  it.each(PROFILE_IDS)(
    "spawns bounded, reachable, separated drops on %s",
    (profile) => {
      let spawned = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = new Match({ ...DEFAULT_SETTINGS, profile }, seed);
        for (let i = 0; i < 6; i++) spawnSupply(g);
        expect(g.supplies.filter(availableSupply).length).toBeLessThanOrEqual(
          SUPPLIES.maxActive,
        );
        for (const d of g.supplies) {
          spawned++;
          expect(d.x).toBeGreaterThanOrEqual(45);
          expect(d.x).toBeLessThanOrEqual(WORLD.width - 45);
          expect(g.tanks.every((t) => Math.abs(t.x - d.x) >= 36)).toBe(true);
          expect(
            g.tanks.some((t) =>
              reachable(
                t,
                d.x,
                g.terrain,
                g.tanks,
                g.settings,
                SUPPLIES.pickupRadius,
              ),
            ),
          ).toBe(true);
        }
        expect(new Set(g.supplies.map((d) => d.id)).size).toBe(
          g.supplies.length,
        );
        if (g.supplies.length === 2)
          expect(
            Math.abs(g.supplies[0].x - g.supplies[1].x),
          ).toBeGreaterThanOrEqual(SUPPLIES.spacing);
      }
      expect(spawned).toBeGreaterThan(35);
    },
  );
  it("uses deterministic deliveries and safe fallback, and disables supplies with movement off", () => {
    const a = flat(),
      b = flat();
    expect(spawnSupply(a)).toEqual(spawnSupply(b));
    a.terrain.heights.fill(450);
    a.tanks.forEach((t) => (t.y = 450));
    a.settings.supplies = false;
    expect(spawnSupply(a)).toBeUndefined();
    a.settings.supplies = true;
    a.settings.movement = false;
    expect(spawnSupply(a)).toBeUndefined();
    a.settings.movement = true;
    for (let x = 0; x <= WORLD.width; x++)
      a.terrain.heights[x] = x % 2 ? 200 : 600;
    expect(spawnSupply(a)).toBeUndefined();
  });
  it("animates before landing and never collects an airborne crate", () => {
    const g = flat();
    const d = spawnSupply(g)!;
    g.current.x = d.x;
    collectSupplies(g);
    expect(d.state).toBe("falling");
    tickSupplies(g, SUPPLIES.deliverySeconds / 2);
    expect(d.y).toBeGreaterThan(60);
    expect(d.y).toBeLessThan(450);
    tickSupplies(g, SUPPLIES.deliverySeconds);
    expect(d.state).toBe("landed");
    expect(d.y).toBe(450);
  });
  it.each(["repair", "fuel", "ammo"] as const)(
    "collects %s through movement exactly once with an identified event",
    (kind) => {
      const g = flat();
      g.current.health = 50;
      g.current.ammo.heavy = 0;
      const d = drop(g, kind);
      moveTo(g, d.x);
      expect(d.state).toBe("collected");
      const saved = structuredClone({
        health: g.current.health,
        fuel: g.current.fuel,
        ammo: g.current.ammo,
      });
      collectSupplies(g);
      collectSupplies(g);
      expect({
        health: g.current.health,
        fuel: g.current.fuel,
        ammo: g.current.ammo,
      }).toEqual(saved);
      expect(
        g.events.filter((e) => e.type === "supply" && e.action === "pickup"),
      ).toHaveLength(1);
      expect(
        g.events.find((e) => e.type === "supply" && e.action === "pickup"),
      ).toMatchObject({ drop: { id: d.id }, tank: 0 });
    },
  );
  it("bounds repair, prevents revival, leaves unneeded supplies, and cannot award outside pickup range", () => {
    const g = flat();
    const d = drop(g, "repair", g.current.x);
    collectSupplies(g);
    expect(d.state).toBe("landed");
    g.current.health = 95;
    collectSupplies(g);
    expect(g.current.health).toBe(100);
    const far = drop(g, "repair", g.current.x + SUPPLIES.pickupRadius + 1);
    g.current.health = 50;
    collectSupplies(g);
    expect(far.state).toBe("landed");
    g.current.health = 0;
    far.x = g.current.x;
    collectSupplies(g);
    expect(g.current.health).toBe(0);
  });
  it("bounds bonus fuel per turn and limited ammo, never restocking Mega Bombs", () => {
    const g = flat();
    g.current.fuel = 0;
    drop(g, "fuel", g.current.x);
    collectSupplies(g);
    expect(g.current.fuel).toBe(64);
    g.current.fuel = 0;
    const second = drop(g, "fuel", g.current.x);
    collectSupplies(g);
    expect(g.current.fuel).toBe(0);
    expect(second.state).toBe("landed");
    resetFuel(g.current);
    expect(g.current.fuelBonus).toBe(0);
    g.current.ammo.mega = 0;
    g.current.ammo.heavy = 0;
    expect(restock(g.current)).toBe("+1 HEAVY AMMO");
    for (let i = 0; i < 30; i++) restock(g.current);
    expect(g.current.ammo.mega).toBe(0);
    for (const w of WEAPONS)
      expect(g.current.ammo[w.id]).toBeLessThanOrEqual(w.ammo);
    expect(restock(g.current)).toBeUndefined();
  });
  it("caps lifetime drops and repair deliveries without recycling event identities", () => {
    const g = flat();
    for (let i = 0; i < 25; i++) {
      g.turn = 5 + i * 4;
      spawnSupply(g);
      for (const d of g.supplies) d.state = "collected";
    }
    expect(g.supplies).toHaveLength(SUPPLIES.maxTotal);
    expect(
      g.supplies.filter((d) => d.kind === "repair").length,
    ).toBeLessThanOrEqual(SUPPLIES.maxRepairs);
    expect(new Set(g.supplies.map((d) => d.id)).size).toBe(SUPPLIES.maxTotal);
  });
  it("destroys a supply without granting rewards and follows deformed ground", () => {
    const g = flat();
    const d = drop(g, "repair");
    destroySupplies(g, d.x, d.y - 10, 30);
    expect(d.state).toBe("destroyed");
    g.current.health = 50;
    moveTo(g, d.x);
    expect(g.current.health).toBe(50);
    const ground = drop(g, "ammo", 500);
    g.terrain.crater(500, 450, 30);
    tickSupplies(g, 0);
    expect(ground.y).toBe(g.terrain.at(500));
  });
  it("destroys supplies through the actual explosion path", () => {
    const g = flat();
    const d = drop(g, "repair", g.current.x);
    g.current.angle = 90;
    g.current.power = 0;
    execute(g, { angle: 90, power: 0, weapon: "standard" });
    expect(d.state).toBe("destroyed");
  });
});
describe("fair bounded AI supply decisions", () => {
  it("walks legally to useful reachable supplies without mutating the planning state", () => {
    let moves = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = flat(seed);
      g.settings.difficulty = "hard";
      g.current.ai = true;
      g.current.health = 30;
      const d = drop(g, "repair", g.current.x + 60);
      const before = JSON.stringify(g);
      const plan = chooseSupplyMove(g);
      expect(JSON.stringify(g)).toBe(before);
      if (!plan) continue;
      moves++;
      expect(plan.evaluations).toBeLessThanOrEqual(SUPPLIES.maxActive * 91);
      const origin = g.current.x;
      for (let i = 0; i < 90 && d.state === "landed"; i++) {
        const x = g.current.x;
        g.move(plan.direction, 1 / 60);
        expect(Math.abs(g.current.x - x)).toBeLessThanOrEqual(
          WORLD.moveSpeed / 60 + 0.001,
        );
      }
      expect(d.state).toBe("collected");
      expect(g.current.health).toBe(55);
      expect(origin).not.toBe(g.current.x);
    }
    expect(moves).toBeGreaterThan(15);
  });
  it("cannot target airborne or blocked supplies, dead tanks, or impossible routes", () => {
    const g = flat(1);
    g.settings.difficulty = "hard";
    g.current.health = 30;
    const d = drop(g, "repair");
    d.state = "falling";
    expect(chooseSupplyMove(g)).toBeUndefined();
    d.state = "landed";
    for (let x = 140; x < 200; x++) g.terrain.heights[x] = 200;
    expect(chooseSupplyMove(g)).toBeUndefined();
    g.terrain.heights.fill(450);
    g.current.health = 0;
    expect(chooseSupplyMove(g)).toBeUndefined();
  });
  it("keeps supply awareness imperfect and distinct across skills", () => {
    const counts = { easy: 0, normal: 0, hard: 0 };
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      for (let seed = 1; seed <= 80; seed++) {
        const g = flat(seed);
        g.settings.difficulty = difficulty;
        g.current.health = 20;
        drop(g, "repair", g.current.x + 48);
        counts[difficulty] += Number(!!chooseSupplyMove(g));
      }
    }
    expect(counts.easy).toBeLessThan(counts.normal);
    expect(counts.normal).toBeLessThan(counts.hard);
    expect(counts.hard).toBeLessThan(80);
  });
});
describe("readable seeded environment", () => {
  it("fully disables events and keeps scheduling deterministic", () => {
    for (let turn = 2; turn < 50; turn++) {
      const off = flat();
      off.turn = turn;
      off.settings.environmentalEvents = false;
      scheduleEnvironment(off);
      expect(off.events).toHaveLength(0);
      expect(off.tremor).toBeUndefined();
      const a = flat(),
        b = flat();
      for (const g of [a, b]) {
        g.settings.environmentalEvents = true;
        g.settings.wind = true;
        g.turn = turn;
        scheduleEnvironment(g);
      }
      expect(a.events).toEqual(b.events);
      expect(a.wind).toBe(b.wind);
    }
  });
  it("announces a gust before launch, bounds wind and never changes it during flight", () => {
    let gusts = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = flat(seed);
      g.settings.environmentalEvents = true;
      g.settings.wind = true;
      g.turn = ENVIRONMENT.gustEvery + 1;
      scheduleEnvironment(g);
      if (
        !g.events.some((e) => e.type === "environment" && e.action === "gust")
      )
        continue;
      gusts++;
      expect(Math.abs(g.wind)).toBeGreaterThanOrEqual(ENVIRONMENT.gustMinimum);
      expect(Math.abs(g.wind)).toBeLessThanOrEqual(WORLD.maxWind);
      const wind = g.wind;
      g.current.angle = 90;
      g.current.power = 30;
      g.fire();
      const projectile = g.projectiles[0],
        velocity = projectile.vx;
      g.tick();
      expect(g.wind).toBe(wind);
      expect(projectile.vx).toBeCloseTo(velocity + wind * WORLD.step);
    }
    expect(gusts).toBeGreaterThan(0);
  });
  it("warns before tremors, deforms only a small region and settles without damage or duplicate events", () => {
    let tremors = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = flat(seed);
      g.settings.environmentalEvents = true;
      g.turn = ENVIRONMENT.tremorEvery + 1;
      scheduleEnvironment(g);
      if (!g.tremor) continue;
      tremors++;
      const x = g.tremor.x;
      const d = drop(g, "ammo", x);
      const original = g.terrain.heights.slice();
      expect(g.phase).toBe("warning");
      expect(g.fire()).toBe(false);
      expect(g.move(1)).toBe(false);
      tickEnvironment(g, ENVIRONMENT.warningSeconds / 2);
      expect(g.terrain.heights).toEqual(original);
      tickEnvironment(g, ENVIRONMENT.warningSeconds);
      tickEnvironment(g, 10);
      expect(g.phase).toBe("aim");
      expect(d.y).toBe(g.terrain.at(x));
      for (let i = 0; i <= WORLD.width; i++) {
        expect(g.terrain.heights[i] - original[i]).toBeLessThanOrEqual(
          ENVIRONMENT.tremorDepth + 0.001,
        );
        if (Math.abs(i - x) > ENVIRONMENT.tremorRadius)
          expect(g.terrain.heights[i]).toBe(original[i]);
      }
      expect(
        g.tanks.every(
          (t) => t.health === 100 && t.y === tankFloor(g.terrain, t.x),
        ),
      ).toBe(true);
      expect(g.events.filter((e) => e.type === "damage")).toHaveLength(0);
      expect(
        g.events.filter(
          (e) => e.type === "environment" && e.action === "tremor",
        ),
      ).toHaveLength(1);
    }
    expect(tremors).toBeGreaterThan(0);
  });
});
describe("survival run state", () => {
  function finish(run: SurvivalRun, won = true): Match {
    const g = run.createMatch();
    g.phase = "over";
    g.winnerId = won ? 0 : 1;
    g.current.health = won ? 40 : 0;
    g.current.kills = won ? g.tanks.length - 1 : 0;
    g.current.damage = 130;
    g.current.shots = 4;
    g.current.hits = 3;
    g.current.ammo.heavy = 0;
    g.current.ammo.mega = 0;
    run.recordBattle(g);
    return g;
  }
  it("advances difficulty, count and terrain without enemy damage or health cheats", () => {
    const run = new SurvivalRun(1);
    for (let battle = 1; battle <= 12; battle++) {
      const g = run.createMatch();
      expect(g.settings.players).toBe(battle <= 4 ? 2 : battle <= 10 ? 3 : 4);
      expect(g.tanks[1].health).toBe(100);
      expect(g.settings.difficulty).toBe(
        battle <= 2 ? "easy" : battle <= 7 ? "normal" : "hard",
      );
      const seed = g.seed;
      finish(run);
      run.continue();
      expect(run.battleSeed).not.toBe(seed);
    }
    expect(run.survived).toBe(12);
  });
  it("carries health and scarce ammo, applies modest bounded recovery and records each encounter once", () => {
    const run = new SurvivalRun(4);
    const g = finish(run);
    run.recordBattle(g);
    expect(run.survived).toBe(1);
    expect(run.damage).toBe(130);
    expect(run.score).toBe(1000 + 250 + 130 + 150);
    expect(() => run.createMatch()).toThrow();
    run.continue();
    const next = run.createMatch();
    expect(next.current.health).toBe(60);
    expect(next.current.ammo.heavy).toBe(1);
    expect(next.current.ammo.mega).toBe(0);
    expect(next.current.fuel).toBe(WORLD.moveFuel);
    expect(next.shotHistory).toHaveLength(0);
    expect(next.tanks[1].health).toBe(100);
  });
  it("respects disabled events and supplies, and caps between-battle recovery", () => {
    const run = new SurvivalRun(2, {
      environmentalEvents: false,
      supplies: false,
      movement: false,
    });
    const g = run.createMatch();
    expect(g.settings).toMatchObject({
      environmentalEvents: false,
      supplies: false,
      movement: false,
    });
    g.phase = "over";
    g.winnerId = 0;
    g.tanks[0].health = 95;
    run.recordBattle(g);
    expect(run.recovery).toBe(5);
    expect(run.recoveryAmmo).toBe("AMMO FULL");
    run.continue();
    const next = run.createMatch();
    expect(next.tanks[0].health).toBe(100);
    expect(next.tanks[0].ammo.mega).toBe(1);
  });
  it("ends on defeat, disallows invalid continuation, persists bests and resets new runs", () => {
    const run = new SurvivalRun(1);
    expect(() => run.continue()).toThrow();
    finish(run, false);
    expect(run.ended).toBe(true);
    expect(() => run.continue()).toThrow();
    expect(() => run.createMatch()).toThrow();
    const best = run.record(readSurvivalRecord(null), true);
    expect(best.runs).toBe(1);
    expect(best.bestScore).toBe(run.score);
    expect(readSurvivalRecord(JSON.stringify(best))).toEqual(best);
    expect(readSurvivalRecord('{"bestStreak":-1,"bestScore":"bad"}')).toEqual(
      readSurvivalRecord(null),
    );
    expect(readSurvivalRecord("bad")).toEqual(readSurvivalRecord(null));
    const fresh = new SurvivalRun(2);
    expect(fresh.survived).toBe(0);
    expect(fresh.health).toBe(100);
    expect(fresh.score).toBe(0);
  });
});
describe("combat regression and presentation events", () => {
  it.each(WEAPONS)(
    "$id respects the full-health attack budget including blast and fall",
    (weapon) => {
      const g = flat();
      g.settings.supplies = false;
      execute(g, { angle: 90, power: 0, weapon: weapon.id });
      expect(100 - g.tanks[0].health).toBeLessThanOrEqual(
        100 * WORLD.maxAttackDamageRatio + 0.001,
      );
      expect(g.tanks[0].health).toBeGreaterThan(0);
    },
  );
  it("reports only actual direct-hit damage and distinguishes a harmless narrow miss", () => {
    for (const [angle, direct] of [
      [5, true],
      [10, false],
    ] as const) {
      const g = flat();
      g.settings.supplies = false;
      g.tanks[1].x = 300;
      g.tanks[1].health = direct ? 8 : 100;
      g.current.angle = angle;
      g.current.power = 55;
      g.fire();
      for (
        let ticks = 0;
        ticks < 2500 && g.phase !== "aim" && g.phase !== "over";
        ticks++
      )
        g.tick();
      if (direct) {
        expect(g.events.filter((e) => e.type === "direct-hit")).toMatchObject([
          { amount: 8, id: 1 },
        ]);
        expect(g.events.filter((e) => e.type === "near-miss")).toHaveLength(0);
      } else {
        expect(g.events.filter((e) => e.type === "direct-hit")).toHaveLength(0);
        expect(g.events.filter((e) => e.type === "near-miss")).toHaveLength(1);
        expect(g.tanks[1].health).toBe(100);
      }
    }
  });
  it("announces the final duel exactly once without changing damage or turn flow", () => {
    const g = new Match({ ...DEFAULT_SETTINGS, players: 3, crates: false }, 1);
    g.tanks[2].health = 0;
    for (let i = 0; i < 2; i++) {
      g.current.angle = g.active === 0 ? 180 : 0;
      g.current.power = 100;
      g.fire();
      let ticks = 0;
      while (g.phase !== "aim" && ticks++ < 2500) g.tick();
    }
    expect(g.events.filter((e) => e.type === "duel")).toHaveLength(1);
    expect(g.phase).toBe("aim");
  });
  it("keeps aiming fallible with supplies and environmental events disabled", () => {
    const g = flat();
    g.settings.supplies = false;
    g.settings.environmentalEvents = false;
    expect(chooseShot(g)).toEqual(chooseShot(g));
  });
});
