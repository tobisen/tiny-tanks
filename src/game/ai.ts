import { clamp, CRATES, random, WORLD } from "./config";
import { blastDamage, integrate, launch, sweep, type Body } from "./physics";
import type { Match } from "./match";
import { WEAPONS, weaponById, type Weapon, type WeaponId } from "./weapons";
export interface Shot {
  angle: number;
  power: number;
  weapon: WeaponId;
}
interface Impact {
  x: number;
  y: number;
  tank?: number;
}

function impact(
  match: Match,
  angle: number,
  power: number,
  weapon: Weapon,
): Impact | undefined {
  const tank = match.current,
    body = launch(tank.x, tank.y - 12, angle, power, weapon.speed);
  const from: Body = { ...body };
  for (let time = 0; time < WORLD.maxFlight; time += 1 / 30) {
    Object.assign(from, body);
    integrate(body, 1 / 30, match.wind, match.gravity);
    const hit = sweep(
      from,
      body,
      match.terrain,
      match.tanks,
      time < 0.24 ? tank.id : -1,
      match.crates,
    );
    if (hit) {
      if (body.x < 0 || body.x > WORLD.width) return;
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
function value(match: Match, hit: Impact, w: Weapon): number {
  const self = match.current;
  const multiplier =
    w.behavior === "cluster" ? 1.65 : w.behavior === "spread" ? 1.35 : 1;
  const blasts = [
    {
      x: hit.x,
      y: hit.y,
      radius: w.radius * multiplier,
      damage: w.damage * multiplier,
      direct: hit.tank,
    },
  ];
  const triggered = new Set<number>();
  if (match.settings.difficulty !== "easy")
    for (let i = 0; i < blasts.length; i++) {
      const b = blasts[i];
      for (const crate of match.crates)
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
            damage: CRATES.damage,
            direct: undefined,
          });
        }
    }
  let score = 0;
  for (const tank of match.tanks) {
    if (tank.health <= 0) continue;
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
      tank.id === self.id
        ? -effective * 2.8
        : effective + (damage >= tank.health ? 35 : 0);
  }
  const closest = Math.min(
    ...match.tanks
      .filter((t) => t.id !== self.id && t.health > 0)
      .map((t) => Math.hypot(hit.x - t.x, hit.y - t.y)),
  );
  const ammoCost: Record<WeaponId, number> = {
    standard: 0,
    heavy: 7,
    triple: 6,
    cluster: 8,
    bunker: 7,
    mega: 22,
  };
  return score - closest * 0.07 - ammoCost[w.id];
}
export function chooseShot(match: Match): Shot {
  const tank = match.current,
    rng = random(match.seed + match.turn * 717),
    difficulty = match.settings.difficulty;
  if (!match.tanks.some((t) => t.health > 0 && t.id !== tank.id))
    return { angle: 90, power: 50, weapon: "standard" };
  const weapons =
    difficulty === "easy"
      ? [weaponById("standard")]
      : WEAPONS.filter((w) => tank.ammo[w.id] > 0);
  let best: Shot = {
      angle: tank.x < WORLD.width / 2 ? 55 : 125,
      power: 65,
      weapon: "standard",
    },
    bestScore = -Infinity;
  const coarse = difficulty === "hard" ? 9 : 12;
  const evaluate = (a: number, p: number, w: Weapon): void => {
    const hit = impact(match, a, p, w);
    if (!hit) return;
    const score = value(match, hit, w);
    if (score > bestScore) {
      bestScore = score;
      best = { angle: a, power: p, weapon: w.id };
    }
  };
  // Bounded coarse search followed by refinement of the strongest available weapon.
  for (const w of weapons)
    for (let a = 15; a <= 165; a += coarse)
      for (let p = 24; p <= 100; p += coarse) evaluate(a, p, w);
  const center = { ...best },
    w = weaponById(best.weapon),
    step = difficulty === "hard" ? 1 : 2;
  for (let a = center.angle - 7; a <= center.angle + 7; a += step)
    for (let p = center.power - 7; p <= center.power + 7; p += step)
      evaluate(clamp(a, 5, 175), clamp(p, 0, 100), w);
  const error =
    difficulty === "easy" ? 10 : difficulty === "normal" ? 2.7 : 0.65;
  return {
    ...best,
    angle: clamp(best.angle + (rng() - 0.5) * error * 2, 0, 180),
    power: clamp(best.power + (rng() - 0.5) * error, 0, 100),
  };
}
