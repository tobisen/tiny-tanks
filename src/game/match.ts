import {
  clamp,
  COLORS,
  NAMES,
  random,
  THEMES,
  WORLD,
  type Settings,
} from "./config";
import { Terrain } from "./terrain";
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
}
export type GameEvent =
  | { type: "shot"; x: number; y: number; weapon: WeaponId }
  | { type: "blast"; x: number; y: number; radius: number; weapon: WeaponId }
  | { type: "damage"; id: number; x: number; y: number; amount: number }
  | { type: "death"; id: number; x: number; y: number }
  | { type: "split"; x: number; y: number }
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
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  active = 0;
  turn = 1;
  wind = 0;
  phase: "aim" | "flight" | "settle" | "over" = "aim";
  winnerId: number | undefined;
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
        power: 64,
        weapon: "standard" as WeaponId,
        damage: 0,
        kills: 0,
        shots: 0,
      };
    });
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
    const body = origin ?? launch(owner.x, owner.y - 12, angle, power);
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
    };
  }
  fire(): boolean {
    if (
      this.phase !== "aim" ||
      !consumeAmmo(this.current.ammo, this.current.weapon)
    )
      return false;
    const tank = this.current;
    tank.shots++;
    const w = weaponById(tank.weapon);
    for (const spread of w.behavior === "spread" ? [-5, 0, 5] : [0])
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
    if (this.phase === "settle") {
      this.settleTime += dt;
      if (this.settleTime > 0.65) this.advance();
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
      );
      if (hit?.tank !== undefined) {
        this.explode(hit.x, hit.y, p, hit.tank);
        continue;
      }
      if (hit?.terrain) {
        if (w.behavior === "penetrate" && !p.child) {
          p.penetration += Math.hypot(p.x - from.x, p.y - from.y);
          if (p.penetration < 40 && p.y < WORLD.height - 15) {
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
      )
        continue;
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
      this.phase = "settle";
      this.settleTime = 0;
    }
  }
  private hurt(tank: Tank, amount: number, owner: number): void {
    if (tank.health <= 0 || amount <= 0) return;
    const actual = Math.min(tank.health, amount);
    tank.health -= actual;
    if (owner !== tank.id) this.tanks[owner].damage += actual;
    this.events.push({
      type: "damage",
      id: tank.id,
      x: tank.x,
      y: tank.y - 24,
      amount: actual,
    });
    if (tank.health <= 0) {
      if (owner !== tank.id) this.tanks[owner].kills++;
      this.events.push({ type: "death", id: tank.id, x: tank.x, y: tank.y });
    }
  }
  private explode(x: number, y: number, p: Projectile, direct?: number): void {
    const w = weaponById(p.weapon);
    const radius = p.child ? 36 : w.radius;
    this.events.push({ type: "blast", x, y, radius, weapon: p.weapon });
    for (const tank of this.tanks)
      this.hurt(
        tank,
        blastDamage(
          Math.hypot(tank.x - x, tank.y - 7 - y),
          radius,
          w.damage,
          tank.id === direct,
        ),
        p.owner,
      );
    this.terrain.crater(x, y, radius);
    for (const tank of this.tanks) {
      const floor = Math.max(
        this.terrain.at(tank.x - 8),
        this.terrain.at(tank.x),
        this.terrain.at(tank.x + 8),
      );
      const fall = Math.max(0, floor - tank.y);
      tank.y = floor;
      this.hurt(
        tank,
        Math.round(Math.max(0, fall - WORLD.fallThreshold) * WORLD.fallDamage),
        p.owner,
      );
    }
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
