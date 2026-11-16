export type WeaponId =
  | "standard"
  | "heavy"
  | "triple"
  | "cluster"
  | "bunker"
  | "mega"
  | "napalm"
  | "betty"
  | "airstrike"
  | "seismic";
export interface Weapon {
  id: WeaponId;
  name: string;
  short: string;
  description: string;
  ammo: number;
  damage: number;
  radius: number;
  color: number;
  behavior: "shell" | "spread" | "cluster" | "penetrate" | "burn" | "bounce" | "airstrike" | "seismic";
  sound: "shell" | "heavy";
  terrainRadius?: number;
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
  { id: "napalm", name: "Napalm", short: "Napalm", description: "Small blast. Fire burns for 3 completed turns: move to escape.", ammo: 2, damage: 22, radius: 27, color: 0xff753f, behavior: "burn", sound: "shell", speed: 1, recoil: 5, shake: 0.001 },
  { id: "betty", name: "Bouncing Betty", short: "Betty", description: "Banks off slopes up to 3 times. Loses speed on every bounce.", ammo: 3, damage: 49, radius: 47, color: 0x70efcf, behavior: "bounce", sound: "shell", speed: 1, recoil: 5, shake: 0.002 },
  { id: "airstrike", name: "Air Strike", short: "Air strike", description: "Select a horizontal target, then confirm FIRE. Five small shells from above.", ammo: 2, damage: 19, radius: 29, color: 0xffde73, behavior: "airstrike", sound: "shell", speed: 1, recoil: 2, shake: 0.001 },
  { id: "seismic", name: "Seismic Charge", short: "Seismic", description: "Low blast damage. A deep, wide crater changes the battlefield.", ammo: 2, damage: 14, radius: 42, terrainRadius: 88, color: 0xb99bff, behavior: "seismic", sound: "heavy", speed: 0.98, recoil: 8, shake: 0.0035 },
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

/** Deterministic bounds, shared by gameplay, previews and AI. */
export const ARSENAL = {
  bounceCount: 3, bounceRetention: 0.62, bounceMinSpeed: 60,
  fireRadius: 53, fireTurns: 3, fireDamage: 5, fireLifetimeBudget: 15, maxFires: 3,
  airCount: 5, airSpacing: 24, airWarning: 0.55,
  shieldFraction: 0.3, shieldCharges: 1, maxShieldCharges: 3,
} as const;
