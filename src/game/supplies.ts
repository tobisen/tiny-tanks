import { random, SUPPLIES, WORLD } from "./config";
import type { Match, Tank } from "./match";
import { reachable } from "./movement";
import { WEAPONS } from "./weapons";
export const SUPPLY_NAMES = {
  repair: "Repair kit",
  fuel: "Fuel pack",
  ammo: "Ammunition crate",
} as const;
export type SupplyKind = keyof typeof SUPPLY_NAMES;
export interface SupplyDrop {
  id: string;
  kind: SupplyKind;
  x: number;
  y: number;
  age: number;
  state: "falling" | "landed" | "collected" | "destroyed";
}
export const availableSupply = (drop: SupplyDrop): boolean =>
  drop.state === "falling" || drop.state === "landed";
export function restock(
  tank: Pick<Tank, "ammo">,
  amount: number = SUPPLIES.ammo,
): string | undefined {
  const choices = WEAPONS.filter(
    (w) => w.id !== "standard" && w.id !== "mega" && tank.ammo[w.id] < w.ammo,
  ).sort((a, b) => tank.ammo[a.id] / a.ammo - tank.ammo[b.id] / b.ammo);
  const weapon = choices[0];
  if (!weapon) return undefined;
  const gain = Math.min(amount, weapon.ammo - tank.ammo[weapon.id]);
  tank.ammo[weapon.id] += gain;
  return `+${gain} ${weapon.short.toUpperCase()} AMMO`;
}
export function spawnSupply(game: Match): SupplyDrop | undefined {
  if (
    !game.settings.supplies ||
    !game.settings.movement ||
    game.supplies.filter(availableSupply).length >= SUPPLIES.maxActive ||
    game.supplies.length >= SUPPLIES.maxTotal
  )
    return undefined;
  const rng = random(game.seed ^ Math.imul(game.turn, 0x1b873593));
  const tanks = game.tanks.filter((t) => t.health > 0);
  if (!tanks.length) return undefined;
  for (let attempt = 0; attempt < SUPPLIES.attempts; attempt++) {
    const tank = tanks[Math.floor(rng() * tanks.length)];
    const x = Math.round(tank.x + (rng() < 0.5 ? -1 : 1) * (48 + rng() * 62));
    if (
      x < 45 ||
      x > WORLD.width - 45 ||
      tanks.some((t) => Math.abs(t.x - x) < 36) ||
      game.crates.some((c) => c.active && Math.abs(c.x - x) < 30) ||
      game.supplies.some(
        (c) => availableSupply(c) && Math.abs(c.x - x) < SUPPLIES.spacing,
      ) ||
      Math.abs(game.terrain.at(x - 10) - game.terrain.at(x + 10)) > 10 ||
      !reachable(
        { ...tank, fuel: WORLD.moveFuel },
        x,
        game.terrain,
        game.tanks,
        game.settings,
        SUPPLIES.pickupRadius,
      )
    )
      continue;
    let kind = (["repair", "fuel", "ammo"] as const)[Math.floor(rng() * 3)];
    if (
      kind === "repair" &&
      game.supplies.filter((c) => c.kind === "repair").length >=
        SUPPLIES.maxRepairs
    )
      kind = "ammo";
    const drop: SupplyDrop = {
      id: `${game.seed}:supply:${game.supplies.length}`,
      kind,
      x,
      y: 60,
      age: 0,
      state: "falling",
    };
    game.supplies.push(drop);
    game.notice = `${SUPPLY_NAMES[kind]} incoming`;
    game.events.push({
      type: "supply",
      action: "drop",
      drop: { ...drop },
      text: game.notice,
    });
    return drop;
  }
  return undefined;
}
export function tickSupplies(game: Match, dt: number): void {
  for (const drop of game.supplies) {
    if (drop.state === "falling") {
      drop.age += dt;
      const floor = game.terrain.at(drop.x);
      drop.y =
        60 + (floor - 60) * Math.min(1, drop.age / SUPPLIES.deliverySeconds);
      if (drop.age >= SUPPLIES.deliverySeconds) {
        drop.state = "landed";
        game.notice = `${SUPPLY_NAMES[drop.kind]} landed`;
        game.events.push({
          type: "supply",
          action: "land",
          drop: { ...drop },
          text: game.notice,
        });
      }
    } else if (drop.state === "landed") drop.y = game.terrain.at(drop.x);
  }
}
export function collectSupplies(game: Match): void {
  const tank = game.current;
  if (tank.health <= 0 || game.phase !== "aim") return;
  for (const drop of game.supplies) {
    if (
      drop.state !== "landed" ||
      Math.hypot(drop.x - tank.x, drop.y - tank.y) > SUPPLIES.pickupRadius
    )
      continue;
    let text: string | undefined;
    if (drop.kind === "repair") {
      const gain = Math.min(
        Math.round(game.settings.health * SUPPLIES.repairFraction),
        game.settings.health - tank.health,
      );
      if (gain > 0) {
        tank.health += gain;
        text = `+${+gain.toFixed(2)} HEALTH`;
      }
    } else if (drop.kind === "fuel") {
      const gain = Math.min(
        SUPPLIES.fuel,
        WORLD.moveFuel - tank.fuel,
        SUPPLIES.maxBonusFuelPerTurn - tank.fuelBonus,
      );
      if (gain > 0) {
        tank.fuel += gain;
        tank.fuelBonus += gain;
        text = `+${+gain.toFixed(2)} FUEL`;
      }
    } else text = restock(tank);
    if (!text) continue; // Leave an unusable supply for a tank that needs it.
    drop.state = "collected";
    game.notice = `${tank.name}: ${text}`;
    game.events.push({
      type: "supply",
      action: "pickup",
      drop: { ...drop },
      tank: tank.id,
      text,
    });
  }
}
export function destroySupplies(
  game: Match,
  x: number,
  y: number,
  radius: number,
): void {
  for (const drop of game.supplies) {
    if (
      !availableSupply(drop) ||
      Math.hypot(drop.x - x, drop.y - 8 - y) > radius + 10
    )
      continue;
    drop.state = "destroyed";
    game.events.push({
      type: "supply",
      action: "destroy",
      drop: { ...drop },
      text: `${SUPPLY_NAMES[drop.kind]} destroyed`,
    });
  }
}
