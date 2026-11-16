import {
  BATTLEFIELDS,
  INPUT_SPEED,
  DEFAULT_SETTINGS,
  type Settings,
  type BattlefieldProfile,
} from "./config";
import { Match } from "./match";
import { restock } from "./supplies";
import { ARSENAL, WEAPONS, createAmmo, type Ammo, type WeaponId } from "./weapons";
export const SURVIVAL = {
  recoveryHealth: 20,
  recoveryAmmo: 1,
  maxPlayers: 4,
} as const;
export const SURVIVAL_KEY = "tiny-tanks-survival-v1";
export interface SurvivalRecord {
  bestStreak: number;
  bestScore: number;
  bestKills: number;
  runs: number;
}
export function readSurvivalRecord(raw: string | null): SurvivalRecord {
  const record: SurvivalRecord = {
    bestStreak: 0,
    bestScore: 0,
    bestKills: 0,
    runs: 0,
  };
  try {
    const data = JSON.parse(raw ?? "null");
    for (const key of Object.keys(record) as (keyof SurvivalRecord)[])
      if (
        typeof data?.[key] === "number" &&
        Number.isFinite(data[key]) &&
        data[key] >= 0
      )
        record[key] = Math.floor(data[key]);
  } catch {
    /* Corrupt or unavailable storage starts a fresh local record. */
  }
  return record;
}
export class SurvivalRun {
  battle = 1;
  survived = 0;
  kills = 0;
  damage = 0;
  shots = 0;
  hits = 0;
  health = 100;
  ammo: Ammo = createAmmo();
  credits = 0;
  lastCredits = 0;
  shieldCharges: number = ARSENAL.shieldCharges;
  fuelReserves = 0;
  ended = false;
  awaitingContinue = false;
  private recorded = new WeakSet<Match>();
  constructor(
    readonly seed = Date.now(),
    readonly preferences: Partial<Settings> = {},
  ) {}
  get score(): number {
    return (
      this.survived * 1000 +
      this.kills * 250 +
      Math.round(this.damage) +
      this.hits * 50
    );
  }
  get settings(): Settings {
    const profile: BattlefieldProfile =
      this.battle <= 2
        ? (["rolling", "valley"] as const)[this.battle - 1]
        : (["ridge", "highlands", "valley", "rolling"] as const)[
            (this.battle - 3) % 4
          ];
    return {
      ...DEFAULT_SETTINGS,
      preview: this.preferences.preview ?? true,
      reducedMotion: this.preferences.reducedMotion ?? false,
      inputSpeed: this.preferences.inputSpeed ?? "normal",
      mode: "survival",
      players:
        this.battle <= 4 ? 2 : this.battle <= 10 ? 3 : SURVIVAL.maxPlayers,
      difficulty:
        this.battle <= 2 ? "easy" : this.battle <= 7 ? "normal" : "hard",
      health: 100,
      profile,
      supplies: this.preferences.supplies ?? true,
      environmentalEvents: this.preferences.environmentalEvents ?? true,
      movement: this.preferences.movement ?? true,
      theme: (["green", "desert", "moon"] as const)[(this.battle - 1) % 3],
    };
  }
  get battleSeed(): number {
    return this.seed + this.battle * 7919;
  }
  get recoveryAmmo(): string {
    return (
      restock({ ammo: { ...this.ammo } }, SURVIVAL.recoveryAmmo) ?? "AMMO FULL"
    );
  }
  get recovery(): number {
    return Math.min(SURVIVAL.recoveryHealth, 100 - this.health);
  }
  createMatch(): Match {
    if (this.ended || this.awaitingContinue)
      throw new Error("Run cannot start an encounter now");
    const match = new Match(this.settings, this.battleSeed);
    this.applyResources(match);
    return match;
  }
  applyResources(match: Match): void {
    match.tanks[0].health = this.health;
    match.tanks[0].ammo = { ...this.ammo };
    match.tanks[0].shieldCharges = this.shieldCharges;
    match.tanks[0].fuelReserves = this.fuelReserves;
  }
  recordBattle(match: Match): void {
    if (this.recorded.has(match)) return;
    if (this.ended || this.awaitingContinue || match.phase !== "over")
      throw new Error("Encounter is not ready to record");
    this.recorded.add(match);
    const tank = match.tanks[0];
    this.kills += tank.kills;
    this.damage += tank.damage;
    this.shots += tank.shots;
    this.hits += tank.hits;
    this.health = tank.health;
    this.ammo = { ...tank.ammo };
    this.shieldCharges = tank.shieldCharges;
    this.fuelReserves = tank.fuelReserves;
    if (match.winnerId === 0) {
      this.lastCredits = 60 + Math.min(40, Math.floor(tank.damage / 4)) + tank.kills * 15 +
        Math.min(15, tank.hits * 3) + Math.min(3, Math.max(0, tank.longestChain - 1)) * 5;
      this.credits += this.lastCredits;
      this.survived++;
      this.awaitingContinue = true;
    } else this.ended = true;
  }
  purchase(item: ShopItem, weapon: WeaponId = "betty"): boolean {
    if (this.ended || !this.awaitingContinue) return false;
    const price = shopPrice(item, weapon);
    if (this.credits < price) return false;
    if (item === "ammo") {
      const w = WEAPONS.find(w => w.id === weapon);
      if (!w || !Number.isFinite(w.ammo) || this.ammo[weapon] >= w.ammo) return false;
      this.ammo[weapon]++;
    } else if (item === "repair") {
      if (this.health >= 100) return false;
      this.health = Math.min(100, this.health + 20);
    } else if (item === "fuel") {
      if (this.fuelReserves >= 1 || !this.settings.movement) return false;
      this.fuelReserves++;
    } else if (item === "shield") {
      if (this.shieldCharges >= ARSENAL.maxShieldCharges) return false;
      this.shieldCharges++;
    } else return false;
    this.credits -= price;
    return true;
  }
  continue(): void {
    if (this.ended || !this.awaitingContinue)
      throw new Error("Win the encounter before continuing");
    this.health += this.recovery;
    restock({ ammo: this.ammo }, SURVIVAL.recoveryAmmo);
    this.battle++;
    this.awaitingContinue = false;
  }
  finish(): void {
    this.ended = true;
    this.awaitingContinue = false;
  }
  record(previous: SurvivalRecord, completedRun = false): SurvivalRecord {
    return {
      bestStreak: Math.max(previous.bestStreak, this.survived),
      bestScore: Math.max(previous.bestScore, this.score),
      bestKills: Math.max(previous.bestKills, this.kills),
      runs: previous.runs + Number(completedRun),
    };
  }
  get battlefield(): string {
    return BATTLEFIELDS[this.settings.profile].name;
  }
}

export type ShopItem = "ammo" | "repair" | "fuel" | "shield";
export const SHOP = {
  ammo: { name: "Ammunition", price: 25, description: "One round, up to starting capacity." },
  repair: { name: "Repair", price: 35, description: "+20 HP, up to 100." },
  fuel: { name: "Fuel Reserve", price: 20, description: "One manual refill. Maximum one in reserve." },
  shield: { name: "Shield Charge", price: 30, description: "One activation. Maximum three charges." },
} as const;
export function shopPrice(item: ShopItem, weapon: WeaponId = "betty"): number {
  return item === "ammo" && weapon === "mega" ? 80 : SHOP[item].price;
}
export const RUN_KEY = "tiny-tanks-run-v1";
export function serializeRun(run: SurvivalRun): string {
  return JSON.stringify({ version: 1, seed: run.seed, preferences: run.preferences,
    battle: run.battle, survived: run.survived, kills: run.kills, damage: run.damage,
    shots: run.shots, hits: run.hits, health: run.health, ammo: run.ammo,
    credits: run.credits, lastCredits: run.lastCredits, shieldCharges: run.shieldCharges,
    fuelReserves: run.fuelReserves, awaitingContinue: run.awaitingContinue, ended: run.ended });
}
export function restoreRun(raw: string | null): SurvivalRun | undefined {
  try {
    const data = JSON.parse(raw ?? "null");
    if (data?.version !== 1 || data.ended || data.awaitingContinue !== true || !Number.isSafeInteger(data.seed)) return;
    const preferences: Partial<Settings> = {};
    for (const key of ["preview", "reducedMotion", "movement", "supplies", "environmentalEvents"] as const)
      if (typeof data.preferences?.[key] === "boolean") preferences[key] = data.preferences[key];
    if (Object.hasOwn(INPUT_SPEED, data.preferences?.inputSpeed ?? "")) preferences.inputSpeed = data.preferences.inputSpeed;
    const run = new SurvivalRun(data.seed, preferences);
    const limits = { battle: 10000, survived: 10000, kills: 40000, damage: 1e8, shots: 1e7, hits: 1e7,
      health: 100, credits: 1e7, lastCredits: 1000, shieldCharges: 3, fuelReserves: 1 };
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
      if (!Number.isFinite(data[key]) || data[key] < 0 || data[key] > limits[key]) return;
      if (key !== "health" && key !== "damage" && !Number.isSafeInteger(data[key])) return;
      run[key] = data[key];
    }
    if (run.battle < 1 || run.health <= 0) return;
    for (const w of WEAPONS) if (Number.isFinite(w.ammo)) {
      const value = data.ammo?.[w.id] ?? w.ammo;
      if (!Number.isInteger(value) || value < 0 || value > w.ammo) return;
      run.ammo[w.id] = value;
    }
    run.awaitingContinue = true;
    return run;
  } catch { return; }
}
