import { random, SUPPLIES, WORLD } from "./config";
import type { Match } from "./match";
import { reachable } from "./movement";
import { WEAPONS } from "./weapons";
export interface SupplyMove {
  supplyId: string;
  direction: -1 | 1;
  targetX: number;
  evaluations: number;
}
export function chooseSupplyMove(game: Match): SupplyMove | undefined {
  if (
    game.phase !== "aim" ||
    !game.settings.supplies ||
    !game.settings.movement ||
    game.current.health <= 0
  )
    return;
  const tank = game.current,
    difficulty = game.settings.difficulty;
  const awareness = { easy: 0.25, normal: 0.65, hard: 0.9 }[difficulty];
  const rng = random(game.seed ^ (game.turn * 7919) ^ (tank.id * 313));
  if (rng() > awareness) return;
  let best: SupplyMove | undefined,
    utility = 0.16,
    evaluations = 0;
  for (const drop of game.supplies) {
    if (
      drop.state !== "landed" ||
      Math.abs(drop.x - tank.x) > tank.fuel + SUPPLIES.pickupRadius
    )
      continue;
    const route = reachable(
      tank,
      drop.x,
      game.terrain,
      game.tanks,
      game.settings,
      SUPPLIES.pickupRadius - 3,
    );
    evaluations += 91; // Maximum local steps per candidate; never a global route search.
    if (!route) continue;
    let value = 0;
    if (drop.kind === "repair")
      value =
        (1 - tank.health / game.settings.health) *
        (difficulty === "hard" ? 2 : 1.4);
    if (drop.kind === "ammo")
      value =
        WEAPONS.filter(
          (w) => w.id !== "mega" && Number.isFinite(w.ammo),
        ).reduce((sum, w) => sum + (w.ammo - tank.ammo[w.id]) / w.ammo, 0) *
        0.24;
    if (drop.kind === "fuel") {
      const enemies = game.tanks.filter(
        (t) => t.id !== tank.id && t.health > 0,
      );
      const before = Math.min(...enemies.map((t) => Math.abs(t.x - tank.x)));
      const after = Math.min(...enemies.map((t) => Math.abs(t.x - drop.x)));
      value =
        before > 300 &&
        after < before &&
        tank.fuelBonus < SUPPLIES.maxBonusFuelPerTurn
          ? 0.6
          : 0;
    }
    const exposed = game.tanks.some(
      (t) => t.id !== tank.id && t.health > 0 && Math.abs(t.x - drop.x) < 110,
    );
    const score =
      value -
      (route.cost / WORLD.moveFuel) * (difficulty === "easy" ? 0.9 : 0.35) -
      Number(exposed) * 0.7;
    if (score > utility) {
      utility = score;
      best = {
        supplyId: drop.id,
        direction: drop.x > tank.x ? 1 : -1,
        targetX: drop.x,
        evaluations,
      };
    }
  }
  if (best) best.evaluations = evaluations;
  return best;
}
