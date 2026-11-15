import { ENVIRONMENT, random, WORLD } from "./config";
import type { Match } from "./match";
import { tickSupplies } from "./supplies";
import { tankFloor } from "./movement";
export interface Tremor {
  id: string;
  x: number;
  remaining: number;
}
export function scheduleEnvironment(game: Match): void {
  if (!game.settings.environmentalEvents) return;
  const completed = game.turn - 1;
  const rng = random(game.seed ^ Math.imul(game.turn, 0x5bd1e995));
  if (
    game.settings.wind &&
    completed % ENVIRONMENT.gustEvery === 0 &&
    rng() < ENVIRONMENT.gustChance
  ) {
    game.wind =
      (rng() < 0.5 ? -1 : 1) *
      Math.max(
        Math.abs(game.wind),
        Math.round(
          ENVIRONMENT.gustMinimum +
            rng() * (WORLD.maxWind - ENVIRONMENT.gustMinimum),
        ),
      );
    game.notice = `WIND GUST · ${Math.abs(game.wind)} ${game.wind < 0 ? "LEFT" : "RIGHT"}`;
    game.events.push({
      type: "environment",
      action: "gust",
      id: `${game.seed}:gust:${game.turn}`,
      x: 640,
      text: game.notice,
    });
  }
  if (
    completed % ENVIRONMENT.tremorEvery === 0 &&
    rng() < ENVIRONMENT.tremorChance
  ) {
    const x = Math.round(100 + rng() * (WORLD.width - 200));
    game.tremor = {
      id: `${game.seed}:tremor:${game.turn}`,
      x,
      remaining: ENVIRONMENT.warningSeconds,
    };
    game.phase = "warning";
    game.notice = "GROUND TREMOR · watch the marked ground";
    game.events.push({
      type: "environment",
      action: "warning",
      id: game.tremor.id,
      x,
      text: game.notice,
    });
  }
}
export function tickEnvironment(game: Match, dt: number): void {
  if (!game.tremor) return;
  game.tremor.remaining -= dt;
  if (game.tremor.remaining > 0) return;
  const { id, x } = game.tremor;
  for (
    let i = Math.max(0, x - ENVIRONMENT.tremorRadius);
    i <= Math.min(WORLD.width, x + ENVIRONMENT.tremorRadius);
    i++
  ) {
    const depth =
      ENVIRONMENT.tremorDepth *
      (1 - Math.abs(i - x) / ENVIRONMENT.tremorRadius) ** 2;
    game.terrain.heights[i] = Math.min(
      WORLD.height - 12,
      game.terrain.heights[i] + depth,
    );
  }
  game.terrain.version++;
  // A shallow disturbance is positional cover, never an unanswerable attack.
  // Settle without damage; the maximum depression is below the fall threshold.
  for (const tank of game.tanks)
    if (Math.abs(tank.x - x) <= ENVIRONMENT.tremorRadius + 8)
      tank.y = tankFloor(game.terrain, tank.x);
  for (const crate of game.crates)
    if (crate.active) crate.y = game.terrain.at(crate.x);
  tickSupplies(game, 0);
  game.tremor = undefined;
  game.phase = "aim";
  game.notice = "Ground settled · take your shot";
  game.events.push({
    type: "environment",
    action: "tremor",
    id,
    x,
    text: game.notice,
  });
}
