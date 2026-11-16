import { clamp, CRATES, random, WORLD } from "./config";
import { AI_SKILLS, normalNoise, uncertainty, type AISkill } from "./ai-config";
import { sampleTerrain, shotMemory } from "./ai-memory";
import {
  blastDamage,
  bounce,
  integrate,
  launch,
  sweep,
  type Body,
  type Target,
} from "./physics";
import type { Match, ShotIntent, Tank } from "./match";
import { ARSENAL, WEAPONS, type Weapon, type WeaponId } from "./weapons";
export interface Shot {
  angle: number;
  power: number;
  weapon: WeaponId;
  intent: ShotIntent;
  correctionApplied: boolean;
  evaluations: number;
  shield?: boolean;
}
interface PerceivedTarget extends Target {
  real: Tank;
}
interface Impact {
  x: number;
  y: number;
  tank?: number;
}
function weighted<T>(
  items: readonly T[],
  weight: (item: T) => number,
  rng: () => number,
): T {
  const weights = items.map((item) => Math.max(0.001, weight(item)));
  let pick = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return items[i];
  }
  return items[items.length - 1];
}
function selectTarget(
  match: Match,
  targets: PerceivedTarget[],
  skill: AISkill,
  rng: () => number,
): PerceivedTarget {
  const self = match.current;
  return weighted(
    targets,
    (t) => {
      const distance = Math.abs(t.x - self.x),
        lowHealth = 1 - t.health / match.settings.health;
      const crates = match.crates.filter(
        (c) => c.active && Math.hypot(c.x - t.x, c.y - t.y) < 150,
      ).length;
      const mid = (self.x + t.x) / 2,
        obstruction =
          match.terrain.at(mid) < (self.y + t.y) / 2 - 30 ? 0.25 : 0;
      const utility =
        (1 - distance / WORLD.width) * 1.3 +
        lowHealth * 0.9 +
        crates * skill.crateAwareness * 0.3 -
        obstruction -
        (Math.abs(t.y - self.y) / WORLD.height) * 0.2;
      return Math.exp(utility * skill.targetSelectionSkill * 2.2);
    },
    rng,
  );
}
function selectWeapon(
  match: Match,
  target: PerceivedTarget,
  targets: PerceivedTarget[],
  skill: AISkill,
  rng: () => number,
): Weapon {
  const available = WEAPONS.filter((w) => match.current.ammo[w.id] > 0);
  if (!available.length) throw new Error("No ammunition available");
  const crowded = targets.filter(
    (t) =>
      t.id !== target.id && Math.hypot(t.x - target.x, t.y - target.y) < 180,
  ).length;
  const nearbyCrates = match.crates.filter(
    (c) => c.active && Math.hypot(c.x - target.x, c.y - target.y) < 170,
  ).length;
  return weighted(
    available,
    (w) => {
      let utility = 1;
      if (w.id === "standard" && target.health < 45) utility += 1.1;
      if (w.id === "heavy" && target.health > 60) utility += 1.1;
      if (w.id === "triple") utility += crowded * 0.6;
      if (w.id === "cluster") utility += crowded * 1.3 + nearbyCrates * 0.25;
      if (w.id === "bunker" && target.y > match.current.y + 25) utility += 1.1;
      if (w.id === "napalm") utility += (match.settings.movement ? 0.7 : 0.3) + (target.real.fuel < 40 ? 0.5 : 0);
      if (w.id === "betty") utility += Math.abs(target.y - match.current.y) < 60 ? 0.6 : 0;
      if (w.id === "airstrike") utility += match.terrain.at((target.x + match.current.x) / 2) < Math.min(target.y, match.current.y) - 35 ? 1.5 : 0.4;
      if (w.id === "seismic") utility += target.y < match.current.y - 30 ? 1.4 : 0;
      if (w.id === "mega") utility += crowded * 2 + nearbyCrates * 0.3;
      if (
        w.radius > 60 &&
        Math.abs(target.x - match.current.x) < w.radius * 1.7
      )
        utility *= skill.riskTolerance;
      if (
        match.current.ammo[w.id] === 1 &&
        target.health < 40 &&
        w.id !== "standard"
      )
        utility *= 0.45;
      return (
        skill.weaponWeights[w.id] *
        (1 + (utility - 1) * skill.weaponSelectionSkill)
      );
    },
    rng,
  );
}
function impact(
  match: Match,
  angle: number,
  power: number,
  weapon: Weapon,
  wind: number,
  targets: Target[],
): Impact | undefined {
  const self = match.current,
    body = launch(self.x, self.y - 12, angle, power, weapon.speed),
    from: Body = { ...body };
  let bounces = 0;
  for (let time = 0; time < WORLD.maxFlight; time += 1 / 30) {
    Object.assign(from, body);
    integrate(body, 1 / 30, wind, match.gravity);
    const hit = sweep(
      from,
      body,
      match.terrain,
      targets,
      time < 0.24 ? self.id : -1,
      match.crates,
    );
    if (hit) {
      if (body.x < 0 || body.x > WORLD.width) return;
      if (hit.terrain && weapon.behavior === "bounce" && bounce(body, hit.x, match.terrain, bounces)) {
        bounces++;
        continue;
      }
      if (hit.terrain && weapon.behavior === "penetrate") {
        const speed = Math.hypot(body.vx, body.vy);
        return {
          ...hit,
          x: hit.x + (body.vx / speed) * WORLD.penetrationDepth,
          y: hit.y + (body.vy / speed) * WORLD.penetrationDepth,
        };
      }
      return hit;
    }
  }
}
function value(
  match: Match,
  hit: Impact,
  w: Weapon,
  target: PerceivedTarget,
  targets: Target[],
  skill: AISkill,
): number {
  const blasts = [
    {
      x: hit.x,
      y: hit.y,
      radius: w.radius,
      damage: w.damage,
      direct: hit.tank,
    },
  ];
  const triggered = new Set<number>();
  if (skill.crateAwareness > 0.2)
    for (let i = 0; i < blasts.length; i++)
      for (const crate of match.crates) {
        const b = blasts[i];
        if (
          crate.active &&
          !triggered.has(crate.id) &&
          triggered.size < CRATES.maxChain &&
          Math.hypot(crate.x - b.x, crate.y - 10 - b.y) <=
            b.radius + CRATES.halfWidth
        ) {
          triggered.add(crate.id);
          blasts.push({
            x: crate.x,
            y: crate.y - 10,
            radius: CRATES.radius,
            damage: CRATES.damage * skill.crateAwareness,
            direct: undefined,
          });
        }
      }
  let score = -Math.hypot(hit.x - target.x, (hit.y - target.y) * 0.8);
  for (const tank of targets) {
    let damage = 0;
    for (const b of blasts)
      damage += blastDamage(
        Math.hypot(tank.x - b.x, tank.y - 7 - b.y),
        b.radius,
        b.damage,
        b.direct === tank.id,
      );
    const effective = Math.min(tank.health, damage);
    score +=
      tank.id === match.current.id
        ? -effective * (2 + (1 - skill.riskTolerance) * 3)
        : effective *
          (tank.id === target.id ? 0.5 : 0.2 * skill.targetSelectionSkill);
  }
  return score;
}
export function chooseShot(match: Match): Shot {
  const self = match.current;
  if (self.health <= 0 || match.phase !== "aim")
    throw new Error("Only a living active tank can plan a shot");
  const skill = AI_SKILLS[match.settings.difficulty],
    seed =
      match.seed ^
      Math.imul(self.id + 1, 0x45d9f3b) ^
      Math.imul(match.turn, 717),
    rng = random(seed),
    execution = random(seed ^ 0x6ac07),
    memoryRng = random(seed ^ 0x83a59);
  const targets = match.tanks
    .filter((t) => t.id !== self.id && t.health > 0)
    .map((t) => ({
      id: t.id,
      x: clamp(
        t.x + normalNoise(rng) * skill.targetPositionError,
        15,
        WORLD.width - 15,
      ),
      y: t.y + normalNoise(rng) * skill.targetPositionError * 0.6,
      health: t.health,
      real: t,
    }));
  if (!targets.length) throw new Error("No living opponent remains");
  const target = selectTarget(match, targets, skill, rng),
    weapon = selectWeapon(match, target, targets, skill, rng);
  const estimatedWind =
    !match.settings.wind || match.wind === 0
      ? 0
      : clamp(
          match.wind + normalNoise(rng) * skill.windEstimationError,
          -WORLD.maxWind,
          WORLD.maxWind,
        );
  const collisionTargets: Target[] = [self, ...targets];
  const guide = shotMemory(
    match,
    target.real,
    weapon.id,
    estimatedWind,
    skill,
    memoryRng,
  );
  let bestAngle = target.x > self.x ? 55 : 125,
    bestPower = 55,
    bestValue = -Infinity,
    evaluations = 0;
  const evaluate = (angle: number, power: number): void => {
    if (evaluations >= skill.trajectorySearchBudget) return;
    evaluations++;
    const hit = impact(
      match,
      angle,
      power,
      weapon,
      estimatedWind,
      collisionTargets,
    );
    if (!hit) return;
    const utility = value(match, hit, weapon, target, collisionTargets, skill);
    if (utility > bestValue) {
      bestValue = utility;
      bestAngle = angle;
      bestPower = power;
    }
  };
  if (weapon.id === "airstrike") {
    // Same confirmed x target as a human; perceived position and execution error remain imperfect.
    const offset = normalNoise(execution) * skill.targetPositionError;
    return { angle: self.angle, power: self.power, weapon: weapon.id, evaluations: ARSENAL.airCount,
      correctionApplied: false, shield: shouldShield(match),
      intent: { target: target.id, estimatedWind, intendedAngle: self.angle, intendedPower: self.power,
        targetX: clamp(target.x + offset, 48, WORLD.width - 48), targetY: target.y, terrainSamples: [] } };
  }
  if (guide) evaluate(guide.angle, guide.power);
  const coarse = Math.floor(skill.trajectorySearchBudget * 0.7),
    angles = Math.max(5, Math.floor(Math.sqrt(coarse * 0.8))),
    powers = Math.floor(coarse / angles);
  for (let a = 0; a < angles; a++)
    for (let p = 0; p < powers; p++) {
      const local = 18 + (a * 65) / (angles - 1);
      evaluate(
        target.x > self.x ? local : 180 - local,
        12 + (p * 88) / (powers - 1),
      );
    }
  const centerAngle = bestAngle,
    centerPower = bestPower;
  while (evaluations < skill.trajectorySearchBudget)
    evaluate(
      clamp(centerAngle + uncertainty(rng) * 7, 2, 178),
      clamp(centerPower + uncertainty(rng) * 9, 0, 100),
    );
  let correctionApplied = false;
  if (guide && Math.abs(guide.angle - bestAngle) < 14) {
    bestPower = clamp(
      bestPower + guide.correction * guide.confidence * skill.learningRate,
      0,
      100,
    );
    correctionApplied = Math.abs(guide.correction) > 0.05;
  }
  // Stable personal bias plus independent execution variation; never corrected after commitment.
  const personality = random(match.seed ^ Math.imul(self.id + 1, 0x27d4eb2d));
  const angleError =
    (normalNoise(personality) * 0.25 +
      normalNoise(execution) * Math.sqrt(1 - 0.25 ** 2)) *
    skill.aimErrorDegrees;
  const powerError =
    (normalNoise(personality) * 0.25 +
      normalNoise(execution) * Math.sqrt(1 - 0.25 ** 2)) *
    skill.powerErrorPercent;
  return {
    angle: clamp(bestAngle + angleError, 0, 180),
    power: clamp(bestPower + powerError, 0, 100),
    weapon: weapon.id,
    evaluations,
    shield: shouldShield(match),
    correctionApplied,
    intent: {
      target: target.id,
      estimatedWind,
      intendedAngle: bestAngle,
      intendedPower: bestPower,
      targetX: target.x,
      targetY: target.y,
      terrainSamples: sampleTerrain(match, self.x, target.x),
    },
  };
}
export function fireAIShot(match: Match, shot: Shot): boolean {
  if (match.current.health <= 0 || match.phase !== "aim") return false;
  if (shot.shield) return match.activateShield();
  match.current.angle = shot.angle;
  match.current.power = shot.power;
  match.current.weapon = shot.weapon;
  if (shot.weapon === "airstrike") match.selectAirTarget(shot.intent.targetX);
  return match.fire(shot.intent);
}

export function shouldShield(match: Match): boolean {
  const tank = match.current;
  if (tank.shield > 0 || tank.shieldCharges <= 0) return false;
  const hazard = match.fires.some(z => Math.abs(z.x - tank.x) <= ARSENAL.fireRadius);
  const threat = match.tanks.some(t => t.id !== tank.id && t.health > 0 && Math.abs(t.x - tank.x) < 470);
  const threshold = { easy: 0.14, normal: 0.23, hard: 0.3 }[match.settings.difficulty];
  return tank.health < match.settings.health * threshold && (threat || hazard);
}
