import { clamp, random, WORLD } from "./config";
import { integrate, launch, sweep } from "./physics";
import type { Match } from "./match";
import type { WeaponId } from "./weapons";
export interface Shot {
  angle: number;
  power: number;
  weapon: WeaponId;
}
export function chooseShot(match: Match): Shot {
  const tank = match.current;
  const rng = random(match.seed + match.turn * 717);
  const opponents = match.tanks.filter((t) => t.health > 0 && t.id !== tank.id);
  const target = [...opponents].sort(
    (a, b) =>
      a.health * 2 +
      Math.abs(a.x - tank.x) * 0.15 -
      (b.health * 2 + Math.abs(b.x - tank.x) * 0.15),
  )[0];
  if (!target) return { angle: 90, power: 50, weapon: "standard" };
  let score = Infinity,
    angle = 60,
    power = 65;
  const difficulty = match.settings.difficulty;
  const increment = difficulty === "hard" ? 3 : 5;
  for (let a = 15; a <= 165; a += increment)
    for (let p = 22; p <= 100; p += increment) {
      const body = launch(tank.x, tank.y - 12, a, p);
      let s = Infinity;
      for (let time = 0; time < 12; time += 1 / 24) {
        const from = { ...body };
        integrate(body, 1 / 24, match.wind, match.gravity);
        const hit = sweep(
          from,
          body,
          match.terrain,
          match.tanks,
          time < 0.24 ? tank.id : -1,
        );
        if (hit) {
          s =
            Math.hypot(hit.x - target.x, (hit.y - target.y) * 0.8) +
            (hit.tank === tank.id ? 1000 : 0);
          break;
        }
        if (body.x < 0 || body.x > WORLD.width) break;
      }
      if (s < score) {
        score = s;
        angle = a;
        power = p;
      }
    }
  const error =
    difficulty === "easy" ? 11 : difficulty === "normal" ? 3.2 : 0.65;
  const preference: WeaponId[] =
    difficulty === "easy"
      ? ["standard"]
      : target.health > 65
        ? ["mega", "heavy", "bunker", "cluster", "triple", "standard"]
        : ["heavy", "triple", "standard"];
  const weapon = preference.find((id) => tank.ammo[id] > 0) ?? "standard";
  return {
    angle: clamp(angle + (rng() - 0.5) * error * 2, 0, 180),
    power: clamp(power + (rng() - 0.5) * error, 0, 100),
    weapon,
  };
}
