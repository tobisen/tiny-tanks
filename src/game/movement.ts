import { clamp, WORLD, type Settings } from "./config";
import type { Tank } from "./match";
import type { Terrain } from "./terrain";

export const tankFloor = (terrain: Terrain, x: number): number =>
  Math.min(terrain.at(x - 8), terrain.at(x), terrain.at(x + 8));
export function sampleTerrainSlope(terrain: Terrain, x: number): number {
  return Math.abs(terrain.at(x + 8) - terrain.at(x - 8)) / 16;
}
export function resetFuel(tank: Tank): void {
  tank.fuel = WORLD.moveFuel;
  tank.fuelBonus = 0;
  tank.moveX = 0;
  tank.moveHeld = 0;
}
export function moveTank(
  tank: Tank,
  direction: -1 | 1,
  dt: number,
  terrain: Terrain,
  tanks: readonly Tank[],
  settings: Settings,
): boolean {
  if (!settings.movement || tank.health <= 0 || tank.fuel <= 0 || dt <= 0)
    return false;
  const start = tank.x;
  let remaining = Math.min(WORLD.moveSpeed * dt, tank.fuel);
  // Walk small swept steps even when a caller supplies a long delta.
  for (let step = 0; step < 100 && remaining > 0.00001; step++) {
    const before = tank.x;
    const x = clamp(
      before + direction * Math.min(3, remaining),
      16,
      WORLD.width - 16,
    );
    const floor = tankFloor(terrain, x);
    if (
      sampleTerrainSlope(terrain, x) > WORLD.maxClimbSlope ||
      Math.abs(floor - tank.y) / 18 > WORLD.maxClimbSlope ||
      tanks.some(
        (t) =>
          t.id !== tank.id &&
          t.health > 0 &&
          Math.abs(t.x - x) < 32 &&
          Math.abs(t.y - floor) < 24,
      )
    )
      break;
    const traveled = Math.abs(x - before);
    if (!traveled) break;
    tank.x = x;
    tank.y = floor;
    tank.fuel = Math.max(0, tank.fuel - traveled);
    tank.moveX = x;
    remaining -= traveled;
  }
  return tank.x !== start;
}
export function reachable(
  tank: Tank,
  x: number,
  terrain: Terrain,
  tanks: readonly Tank[],
  settings: Settings,
  radius = 0,
): { steps: number; cost: number } | undefined {
  const copy = { ...tank };
  const direction = x > tank.x ? 1 : -1;
  for (let steps = 0; steps <= 90; steps++) {
    if (Math.abs(copy.x - x) <= radius + 0.00001)
      return { steps, cost: tank.fuel - copy.fuel };
    if (
      !moveTank(
        copy,
        direction,
        Math.min(1 / 60, (Math.abs(copy.x - x) - radius) / WORLD.moveSpeed),
        terrain,
        tanks,
        settings,
      )
    )
      break;
  }
  return undefined;
}
