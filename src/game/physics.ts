import { CRATES, WORLD } from "./config";
import type { Terrain } from "./terrain";
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
export function launch(
  x: number,
  y: number,
  angle: number,
  power: number,
  speedMultiplier = 1,
): Body {
  const r = (angle * Math.PI) / 180,
    speed = (WORLD.minSpeed + power * WORLD.powerSpeed) * speedMultiplier;
  return {
    x: x + Math.cos(r) * 22,
    y: y - Math.sin(r) * 22,
    vx: Math.cos(r) * speed,
    vy: -Math.sin(r) * speed,
  };
}
export function integrate(
  body: Body,
  dt: number,
  wind: number,
  gravity: number,
): void {
  body.x += body.vx * dt + 0.5 * wind * dt * dt;
  body.y += body.vy * dt + 0.5 * gravity * dt * dt;
  body.vx += wind * dt;
  body.vy += gravity * dt;
}
export interface Target {
  id: number;
  x: number;
  y: number;
  health: number;
}
export interface Collision {
  x: number;
  y: number;
  tank?: number;
  terrain: boolean;
  crate?: number;
}
export interface CrateTarget {
  id: number;
  x: number;
  y: number;
  active: boolean;
}
export function sweep(
  from: Body,
  to: Body,
  terrain: Terrain,
  tanks: readonly Target[],
  ignore: number,
  crates: readonly CrateTarget[] = [],
): Collision | undefined {
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 2),
  );
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps,
      y = from.y + ((to.y - from.y) * i) / steps;
    if (x < 0 || x > WORLD.width) return { x, y, terrain: false };
    for (const tank of tanks)
      if (
        tank.health > 0 &&
        tank.id !== ignore &&
        Math.hypot(x - tank.x, y - (tank.y - 7)) < WORLD.tankRadius
      )
        return { x, y, tank: tank.id, terrain: false };
    for (const crate of crates)
      if (
        crate.active &&
        Math.abs(x - crate.x) <= CRATES.halfWidth &&
        y <= crate.y &&
        y >= crate.y - CRATES.height
      )
        return { x, y, crate: crate.id, terrain: false };
    if (y >= terrain.at(x)) return { x, y, terrain: true };
  }
}
export function blastDamage(
  distance: number,
  radius: number,
  base: number,
  direct = false,
): number {
  if (direct) return Math.round(base * WORLD.directMultiplier);
  return Math.round(
    base *
      Math.pow(
        Math.max(0, 1 - distance / (radius + WORLD.damagePadding)),
        WORLD.damageExponent,
      ),
  );
}
