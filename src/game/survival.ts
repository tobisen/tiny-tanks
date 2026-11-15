import {
  BATTLEFIELDS,
  DEFAULT_SETTINGS,
  type Settings,
  type BattlefieldProfile,
} from "./config";
import { Match } from "./match";
import { restock } from "./supplies";
import { createAmmo, type Ammo } from "./weapons";
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
    if (match.winnerId === 0) {
      this.survived++;
      this.awaitingContinue = true;
    } else this.ended = true;
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
