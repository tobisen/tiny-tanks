export const WORLD = {
  width: 1280,
  height: 640,
  gravity: 170,
  step: 1 / 120,
  maxWind: 23,
  maxFlight: 16,
  tankRadius: 15,
  fallThreshold: 22,
  fallDamage: 0.45,
} as const;
export type ThemeId = "green" | "desert" | "moon";
export type Difficulty = "easy" | "normal" | "hard";
export interface Settings {
  mode: "ai" | "local";
  players: number;
  difficulty: Difficulty;
  wind: boolean;
  theme: ThemeId;
  health: number;
}
export const DEFAULT_SETTINGS: Settings = {
  mode: "ai",
  players: 3,
  difficulty: "normal",
  wind: true,
  theme: "green",
  health: 100,
};
export const COLORS = ["#d5f577", "#ff927a", "#8fc8ff", "#dfacfa"];
export const NAMES = ["Clover", "Ember", "Cobalt", "Nova"];
export const THEMES = {
  green: {
    name: "Green Hills",
    sky: 0x7aa9ab,
    horizon: 0xc2cbb2,
    sun: 0xf5d5a0,
    far: 0x86a49b,
    near: 0x567f7c,
    soil: 0x345649,
    deep: 0x29483f,
    grass: 0xb6d176,
    accent: 0x819c5a,
    gravity: 170,
  },
  desert: {
    name: "Desert",
    sky: 0xb28c97,
    horizon: 0xefc39e,
    sun: 0xffe0a4,
    far: 0xbf9a91,
    near: 0x9d7378,
    soil: 0xb77e54,
    deep: 0x946047,
    grass: 0xf0c583,
    accent: 0xd49a68,
    gravity: 170,
  },
  moon: {
    name: "Moon",
    sky: 0x1c2846,
    horizon: 0x515d7c,
    sun: 0xbfd5ed,
    far: 0x424866,
    near: 0x5b6282,
    soil: 0x737b91,
    deep: 0x535a71,
    grass: 0xc1c6d4,
    accent: 0x929bb1,
    gravity: 110,
  },
} as const;
export function random(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
