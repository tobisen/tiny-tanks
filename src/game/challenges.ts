import { DEFAULT_SETTINGS, WORLD, type Settings } from "./config";
import { Match } from "./match";
import { WEAPONS, type WeaponId } from "./weapons";

export const CHALLENGES = [
  { id: "precision", name: "Precision", objective: "Eliminate the marked target with two shells.", hint: "A low, gentle shot is enough on level ground.", weapon: "standard", rounds: 2 },
  { id: "ricochet", name: "Ricochet", objective: "Hit the target behind the ridge after at least one Betty bounce.", hint: "Skim the slope. A shallow shot retains forward speed.", weapon: "betty", rounds: 4 },
  { id: "demolition", name: "Demolition", objective: "Lower the marked ridge by 60 pixels with Seismic Charge. Survive the shot.", hint: "The marker is at x=600. Land a charge near its crest.", weapon: "seismic", rounds: 3 },
  { id: "laststand", name: "Last Stand", objective: "Win with only 18 HP. Two shields are available.", hint: "Shield protects you while you line up the next shot.", weapon: "standard", rounds: 5 },
  { id: "chain", name: "Chain Reaction", objective: "Trigger the four-crate chain to reach the marked final crate.", hint: "Hit the leftmost crate. The chain carries the blast across the gap.", weapon: "standard", rounds: 3 },
] as const;
export type ChallengeId = typeof CHALLENGES[number]["id"];
export type ChallengeResult = "playing" | "success" | "failure";
export class ChallengeSession {
  readonly definition;
  readonly match: Match;
  result: ChallengeResult = "playing";
  readonly markerX: number;
  constructor(readonly id: ChallengeId, preferences: Partial<Settings> = {}) {
    this.definition = CHALLENGES.find(c => c.id === id)!;
    const settings: Settings = { ...DEFAULT_SETTINGS, preview: preferences.preview ?? true,
      reducedMotion: preferences.reducedMotion ?? false, inputSpeed: preferences.inputSpeed ?? "normal",
      mode: "ai", players: 2, difficulty: "normal", wind: false, theme: "green", profile: "rolling",
      health: 100, movement: true, crates: false, supplies: false, environmentalEvents: false };
    const m = this.match = new Match(settings, 2400 + CHALLENGES.findIndex(c => c.id === id));
    m.terrain.heights.fill(450);
    if (id === "ricochet" || id === "demolition") {
      const center = id === "ricochet" ? 430 : 600;
      for (let x = center - 110; x <= center + 110; x++)
        m.terrain.heights[x] = 450 - Math.max(0, 1 - Math.abs(x - center) / 110) * 90;
    }
    m.terrain.version++;
    m.tanks[0].x = 135;
    m.tanks[1].x = id === "ricochet" ? 640 : id === "precision" ? 400 : id === "laststand" ? 450 : 1120;
    m.tanks[1].name = "Target";
    m.tanks[1].health = id === "laststand" ? 24 : id === "precision" || id === "ricochet" ? 12 : 100;
    m.tanks[1].ai = id === "laststand";
    for (const tank of m.tanks) {
      tank.y = m.terrain.at(tank.x);
      for (const w of WEAPONS) tank.ammo[w.id] = 0;
      tank.weapon = this.definition.weapon;
    }
    m.tanks[0].ammo[this.definition.weapon] = this.definition.rounds;
    m.tanks[0].shieldCharges = id === "laststand" ? 2 : 0;
    m.tanks[1].ammo.standard = Infinity;
    m.tanks[1].weapon = "standard";
    m.tanks[1].shieldCharges = 0;
    if (id === "laststand") m.tanks[0].health = 18;
    if (id === "chain") m.crates = [380, 455, 530, 605].map((x, id) => ({ id, x, y: 450, active: true }));
    this.markerX = id === "demolition" ? 600 : id === "chain" ? 605 : m.tanks[1].x;
    m.objectiveX = this.markerX;
    m.onActionResolved = () => this.resolve();
  }
  private resolve(): void {
    const m = this.match, player = m.tanks[0];
    const shots = m.shotHistory.filter(s => s.owner === 0);
    let success = false;
    if (this.id === "precision" || this.id === "laststand") success = m.tanks[1].health <= 0;
    if (this.id === "ricochet") success = shots.some(s => s.weapon === "betty" && (s.bounces ?? 0) > 0 && s.damage > 0);
    if (this.id === "demolition") success = m.terrain.at(this.markerX) >= 420;
    if (this.id === "chain") success = m.crates.every(c => !c.active) && player.longestChain >= 4;
    if (player.health > 0 && success) this.result = "success";
    else if (player.health <= 0 || m.tanks[1].health <= 0 || player.ammo[this.definition.weapon as WeaponId] <= 0)
      this.result = "failure";
    if (this.result !== "playing") {
      m.phase = "over";
      m.winnerId = this.result === "success" ? 0 : 1;
      m.events.push({ type: "win" });
    } else if (this.id !== "laststand") {
      // Puzzle turns have no passive opponent delay.
      m.active = 1;
    }
  }
  get progress(): string {
    if (this.id === "demolition") return `${Math.max(0, Math.round(this.match.terrain.at(600) - 360))}/60 px lowered`;
    if (this.id === "chain") return `${this.match.crates.filter(c => !c.active).length}/4 crates`;
    return `${Math.ceil(this.match.tanks[1].health)} target HP`;
  }
}
export const CHALLENGE_KEY = "tiny-tanks-challenges-v1";
export function readChallengeBests(raw: string | null): Partial<Record<ChallengeId, number>> {
  const bests: Partial<Record<ChallengeId, number>> = {};
  try {
    const data = JSON.parse(raw ?? "null");
    for (const c of CHALLENGES) if (Number.isInteger(data?.[c.id]) && data[c.id] > 0 && data[c.id] < WORLD.width) bests[c.id] = data[c.id];
  } catch { /* Local bests are optional. */ }
  return bests;
}
