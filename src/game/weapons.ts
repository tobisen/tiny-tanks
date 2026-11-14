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
  speed: number;
  recoil: number;
  shake: number;
}
export const WEAPONS: readonly Weapon[] = [
  {
    id: "standard",
    name: "Standard Shell",
    short: "Shell",
    description: "The trusty all-rounder. Unlimited ammo.",
    ammo: Infinity,
    damage: 43,
    radius: 46,
    color: 0xf6dfac,
    behavior: "shell",
    sound: "shell",
    speed: 1.08,
    recoil: 5,
    shake: 0.0008,
  },
  {
    id: "heavy",
    name: "Heavy Shell",
    short: "Heavy",
    description: "More punch. A bigger crater.",
    ammo: 3,
    damage: 74,
    radius: 59,
    color: 0xffb570,
    behavior: "shell",
    sound: "heavy",
    speed: 0.94,
    recoil: 9,
    shake: 0.003,
  },
  {
    id: "triple",
    name: "Triple Shot",
    short: "Triple",
    description: "Three shells. One wide spread.",
    ammo: 3,
    damage: 27,
    radius: 32,
    color: 0xc8ed86,
    behavior: "spread",
    sound: "shell",
    speed: 1.02,
    recoil: 6,
    shake: 0.001,
  },
  {
    id: "cluster",
    name: "Cluster Bomb",
    short: "Cluster",
    description: "Splits into five bomblets on descent.",
    ammo: 2,
    damage: 24,
    radius: 32,
    color: 0xe3a0ec,
    behavior: "cluster",
    sound: "shell",
    speed: 0.92,
    recoil: 5,
    shake: 0.0015,
  },
  {
    id: "bunker",
    name: "Bunker Buster",
    short: "Bunker",
    description: "Digs through the ground before detonating.",
    ammo: 2,
    damage: 57,
    radius: 54,
    color: 0x9bcfff,
    behavior: "penetrate",
    sound: "heavy",
    speed: 1.05,
    recoil: 8,
    shake: 0.003,
  },
  {
    id: "mega",
    name: "Mega Bomb",
    short: "Mega",
    description: "One shot. A very big statement.",
    ammo: 1,
    damage: 88,
    radius: 100,
    color: 0xff8f73,
    behavior: "shell",
    sound: "heavy",
    speed: 0.83,
    recoil: 12,
    shake: 0.0045,
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
