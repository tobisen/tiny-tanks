import {
  clamp,
  CRATES,
  COLORS,
  NAMES,
  random,
  THEMES,
  WORLD,
  type Settings,
} from "./config";
import { Terrain } from "./terrain";
import { placeCrates, type Crate } from "./crates";
import { blastDamage, integrate, launch, sweep, type Body } from "./physics";
import {
  createAmmo,
  consumeAmmo,
  weaponById,
  type Ammo,
  type WeaponId,
} from "./weapons";
export interface Tank {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  health: number;
  ai: boolean;
  ammo: Ammo;
  angle: number;
  power: number;
  weapon: WeaponId;
  damage: number;
  kills: number;
  shots: number;
  hits: number;
  biggestHit: number;
  longestChain: number;
  lowHealth: boolean;
}
export interface Projectile extends Body {
  id: number;
  owner: number;
  weapon: WeaponId;
  age: number;
  child: boolean;
  penetration: number;
  previousX: number;
  previousY: number;
  shot?: number;
}
export interface ShotIntent {
  target: number;
  estimatedWind: number;
  intendedAngle: number;
  intendedPower: number;
  targetX: number;
  targetY: number;
  terrainSamples: number[];
}
export interface ShotOutcome {
  owner: number;
  turn: number;
  angle: number;
  power: number;
  weapon: WeaponId;
  wind: number;
  originX: number;
  originY: number;
  targets: { id: number; x: number; y: number; health: number }[];
  terrainBefore: number;
  terrainAfter: number;
  intent?: ShotIntent;
  impacts: { x: number; y: number; direct?: number; exploded: boolean }[];
  damage: number;
}
export type GameEvent =
  | { type: "shot"; x: number; y: number; weapon: WeaponId }
  | {
      type: "blast";
      x: number;
      y: number;
      radius: number;
      weapon: WeaponId;
      crate?: boolean;
      underground?: boolean;
    }
  | {
      type: "damage";
      id: number;
      x: number;
      y: number;
      amount: number;
      fall?: boolean;
    }
  | { type: "death"; id: number; x: number; y: number }
  | { type: "split"; x: number; y: number }
  | { type: "penetrate"; x: number; y: number }
  | { type: "crate"; x: number; y: number; id: number }
  | { type: "chain"; count: number; owner: number }
  | { type: "turn" }
  | { type: "win" };
export function nextLiving(tanks: readonly Tank[], current: number): number {
  for (let i = 1; i <= tanks.length; i++) {
    const n = (current + i) % tanks.length;
    if (tanks[n].health > 0) return n;
  }
  return -1;
}
export function winner(
  tanks: readonly Pick<Tank, "health" | "id">[],
): number | undefined {
  const alive = tanks.filter((t) => t.health > 0);
  return alive.length === 1 ? alive[0].id : undefined;
}
export class Match {
  terrain: Terrain;
  tanks: Tank[];
  crates: Crate[];
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  active = 0;
  turn = 1;
  wind = 0;
  phase: "aim" | "flight" | "settle" | "over" = "aim";
  winnerId: number | undefined;
  elapsed = 0;
  longestChain = 0;
  readonly shotHistory: ShotOutcome[] = [];
  private resolvingShot?: ShotOutcome;
  private hitShots = new Set<string>();
  private rng: () => number;
  private serial = 0;
  private settleTime = 0;
  constructor(
    public settings: Settings,
    public seed = Date.now(),
  ) {
    this.rng = random(seed);
    this.terrain = new Terrain(seed);
    this.tanks = Array.from({ length: settings.players }, (_, id) => {
      const x = 135 + (id * (WORLD.width - 270)) / (settings.players - 1);
      return {
        id,
        name: NAMES[id],
        color: COLORS[id],
        x,
        y: this.terrain.at(x),
        health: settings.health,
        ai: settings.mode === "ai" && id > 0,
        ammo: createAmmo(),
        angle: id === 0 ? 55 : 125,
        power:
          settings.theme === "moon"
            ? WORLD.moonStartingPower
            : WORLD.startingPower,
        weapon: "standard" as WeaponId,
        damage: 0,
        kills: 0,
        shots: 0,
        hits: 0,
        biggestHit: 0,
        longestChain: 0,
        lowHealth: false,
      };
    });
    this.crates = settings.crates
      ? placeCrates(seed, this.terrain, this.tanks)
      : [];
    this.rollWind();
  }
  get current(): Tank {
    return this.tanks[this.active];
  }
  get gravity(): number {
    return THEMES[this.settings.theme].gravity;
  }
  private rollWind(): void {
    this.wind = this.settings.wind
      ? Math.round((this.rng() * 2 - 1) * WORLD.maxWind)
      : 0;
  }
  private projectile(
    owner: Tank,
    angle: number,
    power: number,
    child = false,
    origin?: Body,
  ): Projectile {
    const body =
      origin ??
      launch(
        owner.x,
        owner.y - 12,
        angle,
        power,
        weaponById(owner.weapon).speed,
      );
    return {
      ...body,
      id: this.serial++,
      owner: owner.id,
      weapon: owner.weapon,
      age: 0,
      child,
      penetration: 0,
      previousX: body.x,
      previousY: body.y,
      shot: owner.shots,
    };
  }
  fire(intent?: ShotIntent): boolean {
    if (
      this.phase !== "aim" ||
      this.current.health <= 0 ||
      !consumeAmmo(this.current.ammo, this.current.weapon)
    )
      return false;
    const tank = this.current;
    this.resolvingShot = {
      owner: tank.id,
      turn: this.turn,
      angle: tank.angle,
      power: tank.power,
      weapon: tank.weapon,
      wind: this.wind,
      originX: tank.x,
      originY: tank.y,
      targets: this.tanks
        .filter((t) => t.id !== tank.id && t.health > 0)
        .map((t) => ({ id: t.id, x: t.x, y: t.y, health: t.health })),
      terrainBefore: this.terrain.version,
      terrainAfter: this.terrain.version,
      intent,
      impacts: [],
      damage: 0,
    };
    tank.shots++;
    const w = weaponById(tank.weapon);
    for (const spread of w.behavior === "spread"
      ? [-WORLD.spreadAngle, 0, WORLD.spreadAngle]
      : [0])
      this.projectiles.push(
        this.projectile(tank, clamp(tank.angle + spread, 0, 180), tank.power),
      );
    this.phase = "flight";
    this.events.push({
      type: "shot",
      x: tank.x,
      y: tank.y - 12,
      weapon: tank.weapon,
    });
    return true;
  }
  tick(dt = WORLD.step): void {
    if (this.phase !== "over") this.elapsed += dt;
    if (this.phase === "settle") {
      this.settleTime += dt;
      if (this.settleTime > WORLD.settleDelay) this.advance();
      return;
    }
    if (this.phase !== "flight") return;
    const survivors: Projectile[] = [];
    const children: Projectile[] = [];
    for (const p of this.projectiles) {
      p.previousX = p.x;
      p.previousY = p.y;
      p.age += dt;
      const from = { ...p };
      integrate(p, dt, this.wind, this.gravity);
      const w = weaponById(p.weapon);
      const hit = sweep(
        from,
        p,
        this.terrain,
        this.tanks,
        p.age < 0.24 ? p.owner : -1,
        this.crates,
      );
      if (hit?.tank !== undefined || hit?.crate !== undefined) {
        this.explode(hit.x, hit.y, p, hit.tank);
        continue;
      }
      if (hit?.terrain) {
        if (w.behavior === "penetrate" && !p.child) {
          if (p.penetration === 0)
            this.events.push({ type: "penetrate", x: hit.x, y: hit.y });
          p.penetration += Math.hypot(p.x - from.x, p.y - from.y);
          if (
            p.penetration < WORLD.penetrationDepth &&
            p.y < WORLD.height - 15
          ) {
            survivors.push(p);
            continue;
          }
          this.explode(p.x, p.y, p);
          continue;
        }
        this.explode(hit.x, hit.y, p);
        continue;
      }
      if (
        p.x < 0 ||
        p.x > WORLD.width ||
        p.y > WORLD.height + 100 ||
        p.age > WORLD.maxFlight
      ) {
        this.resolvingShot?.impacts.push({ x: p.x, y: p.y, exploded: false });
        continue;
      }
      if (w.behavior === "cluster" && !p.child && p.vy > 12 && p.age > 0.55) {
        for (let i = -2; i <= 2; i++)
          children.push(
            this.projectile(this.tanks[p.owner], 0, 0, true, {
              x: p.x + i * 2,
              y: p.y,
              vx: p.vx * 0.6 + i * 49,
              vy: 25 + Math.abs(i) * 9,
            }),
          );
        this.events.push({ type: "split", x: p.x, y: p.y });
        continue;
      }
      survivors.push(p);
    }
    this.projectiles = [...survivors, ...children];
    if (!this.projectiles.length) {
      if (this.resolvingShot) {
        const shot = this.resolvingShot;
        shot.terrainAfter = this.terrain.version;
        shot.damage = shot.targets.reduce(
          (sum, t) => sum + t.health - this.tanks[t.id].health,
          0,
        );
        this.shotHistory.push(shot);
        if (this.shotHistory.length > 32) this.shotHistory.shift();
        this.resolvingShot = undefined;
      }
      this.phase = "settle";
      this.settleTime = 0;
    }
  }
  private hurt(tank: Tank, amount: number, p: Projectile, fall = false): void {
    if (tank.health <= 0 || amount <= 0) return;
    const actual = Math.min(tank.health, amount);
    tank.health -= actual;
    const owner = p.owner,
      attacker = this.tanks[owner];
    if (owner !== tank.id) {
      attacker.damage += actual;
      attacker.biggestHit = Math.max(attacker.biggestHit, actual);
      if (p.shot && !this.hitShots.has(`${owner}:${p.shot}`)) {
        this.hitShots.add(`${owner}:${p.shot}`);
        attacker.hits++;
      }
    }
    if (tank.health > 0 && tank.health <= this.settings.health * 0.25)
      tank.lowHealth = true;
    this.events.push({
      type: "damage",
      id: tank.id,
      x: tank.x,
      y: tank.y - 24,
      amount: actual,
      fall,
    });
    if (tank.health <= 0) {
      if (owner !== tank.id) this.tanks[owner].kills++;
      this.events.push({ type: "death", id: tank.id, x: tank.x, y: tank.y });
    }
  }
  private explode(x: number, y: number, p: Projectile, direct?: number): void {
    this.resolvingShot?.impacts.push({ x, y, direct, exploded: true });
    const w = weaponById(p.weapon);
    const underground = w.behavior === "penetrate" && p.penetration > 0;
    const queue = [
      {
        x,
        y,
        radius: w.radius,
        damage: w.damage,
        crate: false,
        underground,
        direct,
      },
    ];
    let chained = 0;
    // FIFO, stable crate order, and marking before enqueue make chains deterministic and finite.
    for (let i = 0; i < queue.length; i++) {
      const blast = queue[i];
      this.events.push({
        type: "blast",
        x: blast.x,
        y: blast.y,
        radius: blast.radius,
        weapon: p.weapon,
        crate: blast.crate,
        underground: blast.underground,
      });
      for (const tank of this.tanks)
        this.hurt(
          tank,
          blastDamage(
            Math.hypot(tank.x - blast.x, tank.y - 7 - blast.y),
            blast.radius,
            blast.damage,
            tank.id === blast.direct,
          ),
          p,
        );
      this.terrain.crater(
        blast.x,
        blast.y,
        blast.radius,
        blast.underground ? 1.35 : 1,
      );
      for (const crate of this.crates) {
        if (
          !crate.active ||
          chained >= CRATES.maxChain ||
          Math.hypot(crate.x - blast.x, crate.y - 10 - blast.y) >
            blast.radius + CRATES.halfWidth
        )
          continue;
        crate.active = false;
        chained++;
        this.events.push({
          type: "crate",
          x: crate.x,
          y: crate.y - 10,
          id: crate.id,
        });
        queue.push({
          x: crate.x,
          y: crate.y - 10,
          radius: CRATES.radius,
          damage: CRATES.damage,
          crate: true,
          underground: false,
          direct: undefined,
        });
      }
    }
    this.longestChain = Math.max(this.longestChain, chained);
    this.tanks[p.owner].longestChain = Math.max(
      this.tanks[p.owner].longestChain,
      chained,
    );
    if (chained >= 2)
      this.events.push({ type: "chain", count: chained, owner: p.owner });
    for (const tank of this.tanks) {
      const floor = Math.min(
        this.terrain.at(tank.x - 8),
        this.terrain.at(tank.x),
        this.terrain.at(tank.x + 8),
      );
      const fall = Math.max(0, floor - tank.y);
      tank.y = floor;
      this.hurt(
        tank,
        Math.round(Math.max(0, fall - WORLD.fallThreshold) * WORLD.fallDamage),
        p,
        true,
      );
    }
    for (const crate of this.crates)
      if (crate.active) crate.y = this.terrain.at(crate.x);
  }
  private advance(): void {
    if (this.tanks.filter((t) => t.health > 0).length <= 1) {
      this.winnerId = winner(this.tanks);
      this.phase = "over";
      this.events.push({ type: "win" });
      return;
    }
    this.active = nextLiving(this.tanks, this.active);
    this.turn++;
    this.rollWind();
    this.phase = "aim";
    this.events.push({ type: "turn" });
  }
}
