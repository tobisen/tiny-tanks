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
  minSpeed: 80,
  powerSpeed: 4.8,
  settleDelay: 0.38,
  directMultiplier: 1.35,
  damagePadding: 12,
  damageExponent: 0.8,
  penetrationDepth: 42,
  spreadAngle: 5.5,
  startingPower: 52,
  moonStartingPower: 40,
} as const;
export const CRATES = {
  radius: 96,
  damage: 58,
  halfWidth: 11,
  height: 21,
  spawnClearance: 84,
  maxChain: 8,
} as const;
export const INPUT_SPEED = { precise: 0.6, normal: 1, fast: 1.65 } as const;
export type ThemeId = "green" | "desert" | "moon";
export type Difficulty = "easy" | "normal" | "hard";
export interface Settings {
  mode: "ai" | "local";
  players: number;
  difficulty: Difficulty;
  wind: boolean;
  theme: ThemeId;
  health: number;
  crates: boolean;
  preview: boolean;
  reducedMotion: boolean;
  inputSpeed: keyof typeof INPUT_SPEED;
}
export const DEFAULT_SETTINGS: Settings = {
  mode: "ai",
  players: 3,
  difficulty: "normal",
  wind: true,
  theme: "green",
  health: 100,
  crates: true,
  preview: true,
  reducedMotion: false,
  inputSpeed: "normal",
};
export function quickPlaySettings(
  rng: () => number = Math.random,
  preferences: Partial<Settings> = {},
): Settings {
  const themes: ThemeId[] = ["green", "desert", "moon"];
  return {
    ...DEFAULT_SETTINGS,
    preview: preferences.preview ?? true,
    reducedMotion: preferences.reducedMotion ?? false,
    inputSpeed: preferences.inputSpeed ?? "normal",
    theme: themes[Math.min(2, Math.floor(rng() * 3))],
  };
}
export const COLORS = ["#d5f577", "#ff927a", "#8fc8ff", "#dfacfa"];
export const NAMES = ["Clover", "Ember", "Cobalt", "Nova"];
export const THEMES = {
  green: {
    name: "Green Hills",
    sky: 0x87bbbd,
    horizon: 0xd4dbc0,
    sun: 0xf5d5a0,
    far: 0x86a49b,
    near: 0x567f7c,
    soil: 0x3a604c,
    deep: 0x29483f,
    grass: 0xc0d77c,
    accent: 0x819c5a,
    gravity: 170,
  },
  desert: {
    name: "Desert",
    sky: 0xc0939b,
    horizon: 0xf4d2a5,
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
