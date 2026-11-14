import { WORLD } from "./config";
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
): Body {
  const r = (angle * Math.PI) / 180,
    speed = 80 + power * 4.8;
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
}
export function sweep(
  from: Body,
  to: Body,
  terrain: Terrain,
  tanks: readonly Target[],
  ignore: number,
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
    if (y >= terrain.at(x)) return { x, y, terrain: true };
  }
}
export function blastDamage(
  distance: number,
  radius: number,
  base: number,
  direct = false,
): number {
  if (direct) return Math.round(base * 1.35);
  return Math.round(
    base * Math.pow(Math.max(0, 1 - distance / (radius + 12)), 0.8),
  );
}
