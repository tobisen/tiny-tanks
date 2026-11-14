export type WeaponId =
  | "standard"
  | "heavy"
  | "triple"
  | "cluster"
  | "bunker"
  | "mega";
export interface Weapon {
  id: WeaponId;
  name: string;
  short: string;
  description: string;
  ammo: number;
  damage: number;
  radius: number;
  color: number;
  behavior: "shell" | "spread" | "cluster" | "penetrate";
  sound: "shell" | "heavy";
}
export const WEAPONS: readonly Weapon[] = [
  {
    id: "standard",
    name: "Standard Shell",
    short: "Shell",
    description: "The trusty all-rounder. Unlimited ammo.",
    ammo: Infinity,
    damage: 43,
    radius: 49,
    color: 0xf6dfac,
    behavior: "shell",
    sound: "shell",
  },
  {
    id: "heavy",
    name: "Heavy Shell",
    short: "Heavy",
    description: "More punch. A bigger crater.",
    ammo: 3,
    damage: 65,
    radius: 68,
    color: 0xffb570,
    behavior: "shell",
    sound: "heavy",
  },
  {
    id: "triple",
    name: "Triple Shot",
    short: "Triple",
    description: "Three shells. One wide spread.",
    ammo: 3,
    damage: 29,
    radius: 36,
    color: 0xc8ed86,
    behavior: "spread",
    sound: "shell",
  },
  {
    id: "cluster",
    name: "Cluster Bomb",
    short: "Cluster",
    description: "Splits into five bomblets on descent.",
    ammo: 2,
    damage: 30,
    radius: 36,
    color: 0xe3a0ec,
    behavior: "cluster",
    sound: "shell",
  },
  {
    id: "bunker",
    name: "Bunker Buster",
    short: "Bunker",
    description: "Digs through the ground before detonating.",
    ammo: 2,
    damage: 62,
    radius: 61,
    color: 0x9bcfff,
    behavior: "penetrate",
    sound: "heavy",
  },
  {
    id: "mega",
    name: "Mega Bomb",
    short: "Mega",
    description: "One shot. A very big statement.",
    ammo: 1,
    damage: 95,
    radius: 108,
    color: 0xff8f73,
    behavior: "shell",
    sound: "heavy",
  },
];
export type Ammo = Record<WeaponId, number>;
export function createAmmo(): Ammo {
  return Object.fromEntries(WEAPONS.map((w) => [w.id, w.ammo])) as Ammo;
}
export function consumeAmmo(ammo: Ammo, id: WeaponId): boolean {
  if (ammo[id] <= 0) return false;
  if (Number.isFinite(ammo[id])) ammo[id]--;
  return true;
}
export const weaponById = (id: WeaponId): Weapon =>
  WEAPONS.find((w) => w.id === id)!;
