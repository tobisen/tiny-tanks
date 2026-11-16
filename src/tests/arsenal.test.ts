import { describe, it, expect } from "vitest";
import { Match } from "../game/match";
import { DEFAULT_SETTINGS, WORLD } from "../game/config";
import { ARSENAL, WEAPONS, type WeaponId } from "../game/weapons";
import { bounce } from "../game/physics";
import { AI_SKILLS } from "../game/ai-config";
import { chooseShot, fireAIShot, shouldShield } from "../game/ai";
import { chooseSupplyMove } from "../game/ai-movement";
import { ChallengeSession, CHALLENGES, readChallengeBests } from "../game/challenges";
import { SurvivalRun, restoreRun, serializeRun, shopPrice } from "../game/survival";
function flat() {
  const m = new Match({ ...DEFAULT_SETTINGS, players: 2, wind: false, crates: false, supplies: false, environmentalEvents: false }, 240);
  m.terrain.heights.fill(450);
  m.tanks[0].x = 135; m.tanks[1].x = 700;
  m.tanks.forEach(t => t.y = 450);
  return m;
}
function resolve(m: Match) {
  let ticks = 0;
  while (m.phase !== "aim" && m.phase !== "over" && ticks++ < 2600) m.tick();
  expect(ticks).toBeLessThan(2600);
}
function impact(m: Match, weapon: WeaponId, target = 1) {
  m.current.weapon = weapon;
  if (weapon === "airstrike") m.selectAirTarget(m.tanks[target].x);
  expect(m.fire()).toBe(true);
  if (weapon !== "airstrike") Object.assign(m.projectiles[0], { x: m.tanks[target].x, y: m.tanks[target].y - 25, vx: 0, vy: 300, age: 1 });
  resolve(m);
}
function miss(m: Match) {
  m.current.weapon = "standard"; m.current.angle = 180; m.current.power = 100;
  expect(m.fire()).toBe(true); resolve(m);
}
describe("Arsenal shared damage and ammunition", () => {
  it.each(WEAPONS)("$id spends exactly one round and shares the aggregate attack cap", w => {
    const m = flat(), ammo = m.current.ammo[w.id];
    impact(m, w.id);
    expect(m.tanks[0].ammo[w.id]).toBe(Number.isFinite(ammo) ? ammo - 1 : Infinity);
    expect(100 - m.tanks[1].health).toBeLessThanOrEqual(38.00001);
    expect(m.tanks[1].health).toBeGreaterThan(0);
    expect(m.projectiles).toHaveLength(0);
    expect(m.shotHistory).toHaveLength(1);
  });
  it("returns to an available shell when an exhausted weapon's owner acts again", () => {
    const m = flat(); m.current.ammo.heavy = 1; impact(m, "heavy");
    expect(m.tanks[0].ammo.heavy).toBe(0);
    miss(m); expect(m.active).toBe(0); expect(m.current.weapon).toBe("standard");
    expect(m.fire()).toBe(true);
  });
  it("requires an explicit finite air target, warns, launches five normal colliding shells and finishes quickly", () => {
    const m = flat(); m.current.weapon = "airstrike";
    expect(m.fire()).toBe(false); expect(m.current.ammo.airstrike).toBe(2);
    expect(m.selectAirTarget(NaN)).toBe(false);
    expect(m.selectAirTarget(700)).toBe(true);
    expect(m.fire()).toBe(true); expect(m.projectiles).toHaveLength(0);
    expect(m.events.some(e => e.type === "air-warning")).toBe(true);
    for (let i = 0; i < 65; i++) m.tick();
    expect(m.projectiles).toHaveLength(0);
    m.tick(); m.tick();
    expect(m.projectiles).toHaveLength(ARSENAL.airCount);
    expect(m.projectiles.every(p => p.y < 40 && p.vy > 0)).toBe(true);
    resolve(m);
    expect(m.elapsed).toBeLessThan(4);
    expect(m.shotHistory[0].impacts).toHaveLength(5);
    expect(m.events.filter(e => e.type === "blast")).toHaveLength(5);
  });
  it("bounds reflected velocity, resolves outside the slope and terminates Betty", () => {
    const m = flat(), body = { x: 500, y: 450, vx: 200, vy: 150 };
    expect(bounce(body, 500, m.terrain, 0)).toBe(true);
    expect(body.vy).toBeLessThan(0); expect(body.y).toBeLessThan(450);
    expect(Math.hypot(body.vx, body.vy)).toBeCloseTo(250 * ARSENAL.bounceRetention);
    expect(bounce(body, 500, m.terrain, 3)).toBe(false);
    m.current.weapon = "betty"; m.current.angle = 5; m.current.power = 35;
    m.fire(); resolve(m);
    expect(m.events.filter(e => e.type === "bounce").length).toBeLessThanOrEqual(3);
    expect(m.events.filter(e => e.type === "blast")).toHaveLength(1);
  });
  it("deforms seismic terrain deeply, settles once, leaves valid positions and records actual applied damage", () => {
    const m = flat(); impact(m, "seismic");
    expect(m.terrain.at(700)).toBeGreaterThan(530);
    expect(m.terrain.at(900)).toBe(450);
    expect(m.tanks[1].y).toBeLessThanOrEqual(WORLD.height - 12);
    const health = m.tanks[1].health, falls = m.events.filter(e => e.type === "damage" && e.fall);
    expect(falls).toHaveLength(1);
    for (let i = 0; i < 1000; i++) m.tick();
    expect(m.tanks[1].health).toBe(health);
    const damage = m.events.filter(e => e.type === "damage" && e.id === 1).reduce((n, e) => n + (e.type === "damage" ? e.amount : 0), 0);
    expect(damage).toBeCloseTo(100 - health);
  });
});
describe("persistent fire intervals", () => {
  it("never damages while aiming; ticks once per subsequent completed action and expires after three intervals", () => {
    const m = flat(); impact(m, "napalm");
    const health = m.tanks[1].health;
    expect(m.fires).toHaveLength(1);
    for (let i = 0; i < 3000; i++) m.tick();
    expect(m.tanks[1].health).toBe(health);
    for (let i = 1; i <= 3; i++) { miss(m); expect(m.tanks[1].health).toBeCloseTo(health - i * 5); }
    expect(m.fires).toHaveLength(0);
    expect(m.events.filter(e => e.type === "damage" && e.burn)).toHaveLength(3);
    miss(m); expect(m.tanks[1].health).toBeCloseTo(health - 15);
  });
  it("caps overlapping fire at five per interval and fifteen per zone per target", () => {
    const m = flat();
    m.fires = Array.from({ length: 3 }, () => ({ x: 700, owner: 0, shot: 1, created: 0, remaining: 3, applied: {} }));
    for (let i = 1; i <= 3; i++) { miss(m); expect(m.tanks[1].health).toBe(100 - i * 5); }
    expect(m.fires).toHaveLength(0);
  });
  it("limits active zones and permits moving to escape before the next interval", () => {
    const m = flat(); impact(m, "napalm");
    const health = m.current.health;
    expect(m.move(1, 0.6)).toBe(true);
    miss(m); expect(m.tanks[1].health).toBe(health);
    for (let i = 0; i < 4; i++) { m.active = 0; impact(m, "napalm"); m.tanks[0].ammo.napalm = 2; }
    expect(m.fires.length).toBeLessThanOrEqual(ARSENAL.maxFires);
  });
});
describe("Energy Shield", () => {
  it("consumes a turn without ammunition, refuses stacking and expires after the owner's next action", () => {
    const m = flat(), ammo = { ...m.current.ammo };
    expect(m.activateShield()).toBe(true);
    expect(m.current.shield).toBe(30); expect(m.current.shieldCharges).toBe(0);
    expect(m.activateShield()).toBe(false);
    expect(m.current.ammo).toEqual(ammo); expect(m.current.shots).toBe(0);
    resolve(m); expect(m.active).toBe(1); expect(m.tanks[0].shield).toBe(30);
    miss(m); expect(m.active).toBe(0); expect(m.current.shield).toBe(30);
    miss(m); expect(m.tanks[0].shield).toBe(0);
    expect(m.tanks[0].shieldActions).toBe(0);
  });
  it.each(["standard", "heavy", "cluster", "airstrike"] as WeaponId[])("absorbs aggregate %s weapon damage without resetting per projectile", weapon => {
    const m = flat(); m.tanks[1].shield = 30; m.tanks[1].shieldActions = 2;
    impact(m, weapon);
    const absorbed = m.events.filter(e => e.type === "shield" && e.action === "absorb").reduce((n,e) => n + (e.type === "shield" ? e.amount : 0), 0);
    expect(absorbed).toBeGreaterThan(0);
    expect(absorbed).toBeLessThanOrEqual(30);
    expect(absorbed + 100 - m.tanks[1].health).toBeLessThanOrEqual(38.0001);
  });
  it("absorbs crate explosions and ongoing napalm, while legitimate fall damage bypasses it", () => {
    const m = flat(); m.tanks[1].shield = 30; m.tanks[1].shieldActions = 2;
    m.crates = [{ id: 0, x: 730, y: 450, active: true }]; impact(m, "napalm");
    expect(m.events.some(e => e.type === "crate")).toBe(true);
    const n = flat(); n.tanks[1].shield = 30; n.tanks[1].shieldActions = 2;
    n.fires = [{ x: 700, owner: 0, shot: 1, created: 0, remaining: 1, applied: {} }]; miss(n);
    expect(n.tanks[1].health).toBe(100); expect(n.tanks[1].shield).toBe(25);
    const f = flat(); f.tanks[1].shield = 30; f.tanks[1].shieldActions = 2; impact(f, "seismic");
    expect(f.tanks[1].shield).toBeGreaterThan(0); expect(f.tanks[1].health).toBeLessThan(100);
    expect(f.events.some(e => e.type === "damage" && e.fall)).toBe(true);
  });
  it("AI shares activation rules and escapes burning zones using legal fuel", () => {
    const m = flat(); m.active = 1; m.current.health = 20; m.tanks[0].x = 400;
    expect(shouldShield(m)).toBe(true);
    const shot = chooseShot(m); expect(shot.shield).toBe(true);
    expect(shot.evaluations).toBeLessThanOrEqual(AI_SKILLS.normal.trajectorySearchBudget);
    expect(fireAIShot(m, shot)).toBe(true); expect(m.current.shieldCharges).toBe(0); resolve(m);
    m.active = 1; m.fires = [{ x: 700, owner: 0, shot: 1, created: 0, remaining: 3, applied: {} }];
    const route = chooseSupplyMove(m)!; expect(route.supplyId).toBe("hazard");
    const before = m.current.fuel;
    for (let i = 0; i < 70 && Math.abs(m.current.x - route.targetX) > 5; i++) m.move(route.direction, 1/60);
    expect(m.current.fuel).toBeLessThan(before); expect(Math.abs(m.current.x - 700)).toBeGreaterThan(53);
  });
});
function wonRun() {
  const run = new SurvivalRun(24), m = run.createMatch();
  m.phase = "over"; m.winnerId = 0; m.tanks[0].health = 40;
  m.tanks[0].ammo.betty = 0; m.tanks[0].damage = 100; m.tanks[0].kills = 1;
  m.tanks[0].hits = 2; m.tanks[0].shots = 3; m.tanks[0].longestChain = 3;
  run.recordBattle(m); return { run, m };
}
describe("Survival transactions and checkpoints", () => {
  it("awards deterministic credits once from actual bounded battle counters", () => {
    const { run, m } = wonRun(); expect(run.credits).toBe(116);
    run.recordBattle(m); expect(run.credits).toBe(116);
    expect(new SurvivalRun().purchase("shield")).toBe(false);
    expect(shopPrice("ammo", "mega")).toBe(80);
  });
  it("charges each purchase once, respects funds and caps, and carries supplies into the next battle", () => {
    const { run } = wonRun();
    expect(run.purchase("ammo", "betty")).toBe(true);
    expect(run.purchase("repair")).toBe(true); expect(run.health).toBe(60);
    expect(run.purchase("fuel")).toBe(true); expect(run.purchase("fuel")).toBe(false);
    expect(run.purchase("shield")).toBe(true); expect(run.credits).toBe(6);
    expect(run.purchase("ammo", "mega")).toBe(false);
    run.continue(); const next = run.createMatch();
    expect(next.tanks[0].health).toBe(80); expect(next.tanks[0].ammo.betty).toBe(2); // Purchase plus existing free between-battle round.
    expect(next.tanks[0].shieldCharges).toBe(2); expect(next.tanks[0].fuelReserves).toBe(1);
    next.tanks[0].fuel = 1; expect(next.refillFuel()).toBe(true); expect(next.refillFuel()).toBe(false);
    expect(next.tanks[0].fuel).toBe(128);
    expect(run.purchase("repair")).toBe(false);
  });
  it("caps resources, safely restores shop checkpoints and does not reapply transactions", () => {
    const { run } = wonRun(); run.credits = 500;
    for (let i = 0; i < 9; i++) { run.purchase("repair"); run.purchase("ammo", "betty"); run.purchase("shield"); }
    expect(run.health).toBe(100); expect(run.ammo.betty).toBe(3); expect(run.shieldCharges).toBe(3);
    const saved = serializeRun(run), restored = restoreRun(saved)!;
    expect(restored.credits).toBe(run.credits); expect(restored.ammo.standard).toBe(Infinity);
    expect(restored.health).toBe(run.health); expect(restored.awaitingContinue).toBe(true);
    restored.continue(); expect(restored.createMatch().tanks[0].ammo.betty).toBe(3);
    expect(restoreRun(serializeRun(restored))).toBeUndefined();
    expect(restoreRun("broken")).toBeUndefined();
    const fractional = JSON.parse(saved); fractional.battle = 1.5;
    expect(restoreRun(JSON.stringify(fractional))).toBeUndefined();
    const preferences = JSON.parse(saved); preferences.preferences = { movement: false, reducedMotion: true, inputSpeed: "fast" };
    expect(restoreRun(JSON.stringify(preferences))!.preferences).toEqual(preferences.preferences);
    expect(restoreRun(saved.replace('"credits":', '"credits":-1,"ignored":'))).toBeUndefined();
    run.finish(); expect(restoreRun(serializeRun(run))).toBeUndefined();
  });
  it("can skip the shop immediately and defeat ends credits for the run", () => {
    const { run } = wonRun(); const credits = run.credits; run.continue();
    const m = run.createMatch(); expect(m.tanks[0].health).toBe(60); expect(run.credits).toBe(credits);
    m.phase = "over"; m.winnerId = 1; m.tanks[0].health = 0; run.recordBattle(m);
    expect(run.ended).toBe(true); expect(run.purchase("repair")).toBe(false);
    expect(new SurvivalRun().credits).toBe(0);
  });
});
const solutions = { precision: [2,62], ricochet: [2,58], demolition: [10,92], laststand: [2,80], chain: [2,52] } as const;
describe("five deterministic, attainable challenges", () => {
  it.each(CHALLENGES)("$name has valid repeatable placements, success and failure", definition => {
    const c = new ChallengeSession(definition.id), m = c.match;
    const again = new ChallengeSession(definition.id);
    expect(m.terrain.heights).toEqual(again.match.terrain.heights);
    expect(m.tanks).toEqual(again.match.tanks);
    for (const t of m.tanks) { expect(t.y).toBe(m.terrain.at(t.x)); expect(t.x).toBeGreaterThan(15); expect(t.x).toBeLessThan(1265); }
    const [angle,power] = solutions[c.id]; m.current.angle=angle; m.current.power=power; m.fire(); resolve(m);
    if (c.id === "laststand") {
      expect(fireAIShot(m, chooseShot(m))).toBe(true); resolve(m);
      m.current.angle=angle; m.current.power=power; m.fire(); resolve(m);
    }
    expect(c.result).toBe("success"); expect(m.phase).toBe("over"); expect(m.winnerId).toBe(0);
    const failure = new ChallengeSession(c.id);
    failure.match.current.ammo[definition.weapon] = 1;
    failure.match.current.angle = 180; failure.match.current.power = 100;
    failure.match.fire(); resolve(failure.match);
    expect(failure.result).toBe("failure");
    expect(new ChallengeSession(c.id).match.tanks[0].shots).toBe(0);
  });
  it("rejects direct hits for the bounce objective and safely reads optional bests", () => {
    expect(readChallengeBests('{"precision":1,"ricochet":-4,"chain":"bad"}')).toEqual({precision:1});
    expect(readChallengeBests("bad")).toEqual({});
    const c = new ChallengeSession("ricochet"); impact(c.match,"betty");
    expect(c.result).toBe("failure");
  });
});
