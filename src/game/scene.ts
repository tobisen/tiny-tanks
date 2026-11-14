import Phaser from "phaser";
import { chooseShot } from "./ai";
import { AudioManager } from "./audio";
import { clamp, random, THEMES, WORLD, type Settings } from "./config";
import { Match, type GameEvent, type Tank } from "./match";
import { integrate, launch } from "./physics";
import { weaponById } from "./weapons";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  gravity: number;
}
interface Flash {
  x: number;
  y: number;
  radius: number;
  age: number;
  color: number;
}
interface TankView {
  graphics: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  health: Phaser.GameObjects.Graphics;
  y: number;
  hit: number;
  recoil: number;
}
export class BattleScene extends Phaser.Scene {
  match!: Match;
  paused = false;
  demo = true;
  onChange: () => void = () => {};
  onReady: () => void = () => {};
  readonly soundFX = new AudioManager();
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private background!: Phaser.GameObjects.Graphics;
  private cloudGraphics!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private projectileGraphics!: Phaser.GameObjects.Graphics;
  private tankViews: TankView[] = [];
  private terrainVersion = -1;
  private accumulator = 0;
  private aiClock = 0;
  private aiShot?: ReturnType<typeof chooseShot>;
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private trails = new Map<number, { x: number; y: number }[]>();
  private ambient = 0;
  private toast?: Phaser.GameObjects.Text;
  private held = new Set<string>();
  constructor() {
    super("battle");
  }
  create(): void {
    this.background = this.add.graphics();
    this.cloudGraphics = this.add.graphics();
    this.terrainGraphics = this.add.graphics();
    this.aimGraphics = this.add.graphics();
    this.projectileGraphics = this.add.graphics();
    this.effects = this.add.graphics().setDepth(10);
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.matches("input,select") ||
        document.querySelector("dialog[open]")
      )
        return;
      this.held.add(event.code);
    });
    window.addEventListener("keyup", (event: KeyboardEvent) =>
      this.held.delete(event.code),
    );
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.held.clear());
    this.startMatch(
      {
        mode: "ai",
        players: 3,
        difficulty: "normal",
        wind: true,
        theme: "green",
        health: 100,
      },
      true,
    );
    this.onReady();
  }
  startMatch(settings: Settings, demo = false, seed?: number): void {
    this.match = new Match({ ...settings }, seed);
    this.demo = demo;
    this.paused = false;
    this.aiClock = 0;
    this.aiShot = undefined;
    this.accumulator = 0;
    this.particles = [];
    this.flashes = [];
    this.trails.clear();
    this.held.clear();
    this.terrainVersion = -1;
    this.toast?.destroy();
    this.toast = undefined;
    for (const view of this.tankViews) {
      view.graphics.destroy();
      view.name.destroy();
      view.health.destroy();
    }
    this.tankViews = this.match.tanks.map((tank) => ({
      graphics: this.add.graphics().setDepth(4),
      name: this.add
        .text(
          tank.x,
          tank.y + 25,
          `${String(tank.id + 1).padStart(2, "0")} ${tank.name.toUpperCase()}`,
          {
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#f5f1d9",
            stroke: "#29483f",
            strokeThickness: 3,
          },
        )
        .setOrigin(0.5)
        .setDepth(5),
      health: this.add.graphics().setDepth(5),
      y: tank.y,
      hit: 0,
      recoil: 0,
    }));
    this.drawBackground();
    this.drawTerrain();
    this.onChange();
    if (!demo)
      this.announce(`${this.match.current.name.toUpperCase()}, YOU’RE UP`);
  }
  fire(): void {
    if (this.demo || this.paused || this.match.current.ai) return;
    this.soundFX.unlock();
    if (this.match.fire()) this.onChange();
  }
  setAim(angle: number, power: number): void {
    if (!this.canAim) return;
    this.match.current.angle = clamp(angle, 0, 180);
    this.match.current.power = clamp(power, 0, 100);
    this.onChange();
  }
  get canAim(): boolean {
    return (
      !this.demo &&
      !this.paused &&
      this.match.phase === "aim" &&
      !this.match.current.ai
    );
  }
  private drawBackground(): void {
    const g = this.background,
      t = THEMES[this.match.settings.theme];
    g.clear();
    const sky = Phaser.Display.Color.IntegerToColor(t.sky),
      horizon = Phaser.Display.Color.IntegerToColor(t.horizon);
    for (let y = 0; y < WORLD.height; y += 4) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        sky,
        horizon,
        510,
        Math.min(y, 510),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      g.fillRect(0, y, WORLD.width, 4);
    }
    const sunX = 967;
    g.fillStyle(t.sun, 0.1).fillCircle(sunX, 139, 98);
    g.fillStyle(t.sun, 0.15).fillCircle(sunX, 139, 81);
    g.fillStyle(t.sun).fillCircle(sunX, 139, 61);
    if (this.match.settings.theme === "moon") {
      const rng = random(this.match.seed + 1);
      for (let i = 0; i < 95; i++) {
        g.fillStyle(0xf3efde, 0.3 + rng() * 0.6).fillRect(
          rng() * WORLD.width,
          rng() * 310,
          2,
          2,
        );
      }
      g.fillStyle(0x8395b8, 0.45)
        .fillCircle(sunX + 18, 120, 13)
        .fillCircle(sunX - 22, 157, 20);
    }
    const rng = random(this.match.seed + 17);
    for (let layer = 0; layer < 3; layer++) {
      g.fillStyle(
        layer === 0 ? t.far : layer === 1 ? t.near : t.deep,
        layer === 2 ? 0.36 : 1,
      );
      g.beginPath();
      g.moveTo(0, 600);
      for (let x = 0; x <= WORLD.width + 70; x += 64) {
        const y =
          layer === 0
            ? 270 + Math.sin(x / 200) * 40 + rng() * 75
            : layer === 1
              ? 330 + Math.sin(x / 140 + 2) * 36 + rng() * 50
              : 420 + rng() * 55;
        g.lineTo(x, y);
      }
      g.lineTo(WORLD.width, 640);
      g.closePath();
      g.fillPath();
    }
    // Tiny original pine silhouettes give scale to the battlefield.
    if (this.match.settings.theme === "green")
      for (let x = 0; x < WORLD.width; x += 23) {
        const y = 363 + Math.sin(x / 137) * 26;
        g.fillStyle(t.deep, 0.42);
        g.fillTriangle(x, y - 14, x - 7, y + 4, x + 7, y + 4);
        g.fillTriangle(x, y - 23, x - 5, y - 8, x + 5, y - 8);
      }
  }
  private drawTerrain(): void {
    const g = this.terrainGraphics,
      terrain = this.match.terrain,
      t = THEMES[this.match.settings.theme];
    g.clear();
    g.fillStyle(t.soil);
    g.beginPath();
    g.moveTo(0, WORLD.height);
    for (let x = 0; x <= WORLD.width; x += 2) g.lineTo(x, terrain.at(x));
    g.lineTo(WORLD.width, WORLD.height);
    g.closePath();
    g.fillPath();
    g.fillStyle(t.deep);
    g.beginPath();
    g.moveTo(0, WORLD.height);
    for (let x = 0; x <= WORLD.width; x += 4)
      g.lineTo(
        x,
        Math.min(WORLD.height, terrain.at(x) + 59 + Math.sin(x / 70) * 12),
      );
    g.lineTo(WORLD.width, WORLD.height);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, t.accent, 0.2);
    g.beginPath();
    for (let x = 0; x <= WORLD.width; x += 4) {
      const y = Math.min(638, terrain.at(x) + 97 + Math.sin(x / 80) * 15);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
    g.lineStyle(5, t.grass);
    g.beginPath();
    for (let x = 0; x <= WORLD.width; x += 2) {
      if (x === 0) g.moveTo(x, terrain.at(x));
      else g.lineTo(x, terrain.at(x));
    }
    g.strokePath();
    const rng = random(this.match.seed + 81);
    for (let i = 0; i < 360; i++) {
      const x = rng() * WORLD.width,
        y = terrain.at(x) + 12 + rng() * 220;
      if (y < 636) {
        g.fillStyle(i % 3 === 0 ? t.grass : t.accent, i % 3 === 0 ? 0.14 : 0.3);
        g.fillRect(x, y, i % 3 === 0 ? 3 : 5, 2);
      }
    }
    for (let x = 17; x < WORLD.width; x += 37) {
      const y = terrain.at(x);
      g.fillStyle(t.grass, 0.8).fillRect(x, y - 4, 2, 4);
      if (this.match.settings.theme === "green" && x % 3 === 0)
        g.fillRect(x + 3, y - 7, 2, 5);
    }
    this.terrainVersion = terrain.version;
  }
  private drawTank(tank: Tank, view: TankView, delta: number): void {
    view.y = Phaser.Math.Linear(view.y, tank.y, Math.min(1, delta * 12));
    view.hit = Math.max(0, view.hit - delta);
    view.recoil = Math.max(0, view.recoil - delta * 20);
    const g = view.graphics;
    g.clear();
    view.name.setPosition(tank.x, view.y + 25).setVisible(tank.health > 0);
    view.health.clear();
    if (tank.health <= 0) return;
    const color =
      view.hit > 0
        ? 0xffffff
        : Phaser.Display.Color.HexStringToColor(tank.color).color;
    const x = tank.x,
      y = view.y,
      angle = (tank.angle * Math.PI) / 180;
    if (
      this.match.current.id === tank.id &&
      this.match.phase === "aim" &&
      !this.demo
    ) {
      g.lineStyle(1, color, 0.5);
      g.strokeEllipse(x, y + 4, 49, 14);
      g.fillStyle(color).fillTriangle(
        x,
        y - 51 + Math.sin(this.ambient * 3) * 3,
        x - 5,
        y - 59 + Math.sin(this.ambient * 3) * 3,
        x + 5,
        y - 59 + Math.sin(this.ambient * 3) * 3,
      );
    }
    g.fillStyle(0x102b29, 0.22).fillEllipse(x + 3, y + 5, 43, 10);
    g.lineStyle(7, 0x1a3035).lineBetween(
      x,
      y - 13,
      x + Math.cos(angle) * (28 - view.recoil),
      y - 13 - Math.sin(angle) * (28 - view.recoil),
    );
    g.lineStyle(4, color).lineBetween(
      x,
      y - 14,
      x + Math.cos(angle) * (27 - view.recoil),
      y - 14 - Math.sin(angle) * (27 - view.recoil),
    );
    g.fillStyle(0x172d31).fillRoundedRect(x - 20, y - 7, 40, 12, 5);
    g.fillStyle(0x879992)
      .fillRect(x - 15, y - 4, 5, 5)
      .fillRect(x - 6, y - 4, 5, 5)
      .fillRect(x + 3, y - 4, 5, 5)
      .fillRect(x + 12, y - 4, 4, 5);
    g.fillStyle(color)
      .fillRect(x - 17, y - 14, 34, 9)
      .fillRect(x - 9, y - 22, 20, 10);
    g.fillStyle(0xffffff, 0.28).fillRect(x - 7, y - 22, 15, 3);
    g.fillStyle(0x142f32, 0.3).fillRect(x + 5, y - 18, 5, 4);
    const hp = view.health;
    hp.fillStyle(0x102b29, 0.4).fillRect(x - 18, y + 12, 36, 3);
    hp.fillStyle(color).fillRect(
      x - 18,
      y + 12,
      (36 * tank.health) / this.match.settings.health,
      3,
    );
  }
  private addParticles(
    x: number,
    y: number,
    count: number,
    color: number,
    strength: number,
  ): void {
    for (let i = 0; i < count && this.particles.length < 300; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = (30 + Math.random() * 150) * strength,
        life = 0.35 + Math.random() * 0.75;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        life,
        max: life,
        size: 2 + Math.random() * 5,
        color,
        gravity: 200,
      });
    }
  }
  private handleEvent(event: GameEvent): void {
    if (event.type === "shot") {
      const w = weaponById(event.weapon),
        tank = this.match.current,
        r = (tank.angle * Math.PI) / 180;
      const x = event.x + Math.cos(r) * 29,
        y = event.y - Math.sin(r) * 29;
      this.flashes.push({ x, y, radius: 20, age: 0, color: 0xffefb2 });
      this.addParticles(x, y, 9, 0xffdc86, 0.6);
      this.tankViews[tank.id].recoil = 5;
      this.soundFX.fire(w.sound === "heavy");
    } else if (event.type === "blast") {
      const w = weaponById(event.weapon);
      this.flashes.push({
        x: event.x,
        y: event.y,
        radius: event.radius,
        age: 0,
        color: w.color,
      });
      this.addParticles(
        event.x,
        event.y,
        Math.round(event.radius * 0.55),
        0xffc77f,
        event.radius / 55,
      );
      this.addParticles(
        event.x,
        event.y,
        16,
        THEMES[this.match.settings.theme].soil,
        event.radius / 65,
      );
      this.soundFX.boom(
        Math.min(0.9, event.radius / 110),
        event.radius > 70 ? 0.7 : 0.4,
      );
      if (event.radius > 55)
        this.cameras.main.shake(170, Math.min(0.006, event.radius / 22000));
    } else if (event.type === "damage") {
      this.tankViews[event.id].hit = 0.18;
      this.soundFX.hit();
      const text = this.add
        .text(event.x, event.y - 10, `−${event.amount}`, {
          fontFamily: "monospace",
          fontStyle: "bold",
          fontSize: "24px",
          color: "#fff4d0",
          stroke: "#543d36",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(20);
      this.tweens.add({
        targets: text,
        y: text.y - 53,
        alpha: 0,
        duration: 1150,
        ease: "Cubic.Out",
        onComplete: () => text.destroy(),
      });
    } else if (event.type === "death") {
      this.addParticles(event.x, event.y, 30, 0xff927a, 1.3);
      this.flashes.push({
        x: event.x,
        y: event.y,
        radius: 42,
        age: 0,
        color: 0xff927a,
      });
      this.soundFX.boom(0.7, 0.65);
    } else if (event.type === "split") {
      this.addParticles(event.x, event.y, 14, 0xe3a0ec, 0.5);
      this.soundFX.fire();
    } else if (event.type === "turn") {
      this.aiClock = 0;
      this.aiShot = undefined;
      this.announce(
        `${this.match.current.name.toUpperCase()}${this.match.current.ai ? " IS AIMING…" : ", YOU’RE UP"}`,
      );
    } else if (event.type === "win") {
      this.soundFX.victory();
      for (let i = 0; i < 5; i++)
        this.time.delayedCall(i * 160, () => {
          if (this.match.phase === "over")
            this.addParticles(
              200 + Math.random() * 880,
              90 + Math.random() * 170,
              35,
              [0xd5f577, 0xff927a, 0xf1e4ba][i % 3],
              1.2,
            );
        });
    }
    this.onChange();
  }
  private announce(message: string): void {
    this.toast?.destroy();
    const toast = this.add
      .text(WORLD.width / 2, 55, message, {
        fontFamily: "monospace",
        fontSize: "16px",
        fontStyle: "bold",
        letterSpacing: 3,
        color: "#fdf5da",
        backgroundColor: "#243f40",
        padding: { x: 18, y: 11 },
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(20);
    this.toast = toast;
    this.tweens.add({
      targets: toast,
      alpha: 1,
      duration: 130,
      hold: 1200,
      yoyo: true,
      onComplete: () => {
        toast.destroy();
        if (this.toast === toast) this.toast = undefined;
      },
    });
  }
  update(_time: number, deltaMs: number): void {
    if (!this.match) return;
    const delta = Math.min(deltaMs / 1000, 0.05);
    this.ambient += delta;
    const t = THEMES[this.match.settings.theme],
      cloud = this.cloudGraphics;
    cloud.clear();
    if (this.match.settings.theme !== "moon")
      for (let i = 0; i < 7; i++) {
        const x = ((i * 237 + this.ambient * (i % 2 ? 3 : 5)) % 1530) - 140,
          y = 65 + (i % 3) * 51;
        cloud
          .fillStyle(t.sun, 0.17)
          .fillRect(x, y, 100, 9)
          .fillRect(x + 20, y - 7, 46, 8)
          .fillRect(x - 17, y + 9, 145, 5);
      }
    if (!this.paused && !this.demo) {
      if (this.canAim) {
        const angle =
          (Number(this.held.has("ArrowLeft")) -
            Number(this.held.has("ArrowRight"))) *
          delta *
          40;
        const power =
          (Number(this.held.has("ArrowUp")) -
            Number(this.held.has("ArrowDown"))) *
          delta *
          30;
        if (angle || power)
          this.setAim(
            this.match.current.angle + angle,
            this.match.current.power + power,
          );
      }
      if (this.match.phase === "aim" && this.match.current.ai) {
        this.aiClock += delta;
        if (!this.aiShot) this.aiShot = chooseShot(this.match);
        this.match.current.angle = Phaser.Math.Linear(
          this.match.current.angle,
          this.aiShot.angle,
          Math.min(1, delta * 7),
        );
        this.match.current.power = this.aiShot.power;
        this.match.current.weapon = this.aiShot.weapon;
        if (this.aiClock > 0.85) {
          this.match.current.angle = this.aiShot.angle;
          this.match.fire();
          this.onChange();
        }
      }
      this.accumulator += delta;
      while (this.accumulator >= WORLD.step) {
        this.match.tick();
        this.accumulator -= WORLD.step;
      }
      for (const event of this.match.events.splice(0)) this.handleEvent(event);
    }
    if (this.terrainVersion !== this.match.terrain.version) this.drawTerrain();
    for (const tank of this.match.tanks)
      this.drawTank(tank, this.tankViews[tank.id], this.paused ? 0 : delta);
    this.drawAim();
    this.drawProjectiles();
    this.drawEffects(this.paused ? 0 : delta);
  }
  private drawAim(): void {
    const g = this.aimGraphics;
    g.clear();
    if (!this.canAim) return;
    const tank = this.match.current,
      body = launch(tank.x, tank.y - 12, tank.angle, tank.power);
    g.fillStyle(0xfff3d6, 0.55);
    for (let i = 0; i < 12; i++) {
      integrate(body, 0.037, this.match.wind, this.match.gravity);
      if (body.y >= this.match.terrain.at(body.x)) break;
      g.fillCircle(body.x, body.y, i < 3 ? 2 : 1.5);
    }
  }
  private drawProjectiles(): void {
    const g = this.projectileGraphics;
    g.clear();
    const ids = new Set(this.match.projectiles.map((p) => p.id));
    for (const id of this.trails.keys())
      if (!ids.has(id)) this.trails.delete(id);
    for (const p of this.match.projectiles) {
      let trail = this.trails.get(p.id);
      if (!trail) {
        trail = [];
        this.trails.set(p.id, trail);
      }
      // Interpolate the fixed simulation state for smooth rendering at any refresh rate.
      const alpha = this.accumulator / WORLD.step,
        x = p.previousX + (p.x - p.previousX) * alpha,
        y = p.previousY + (p.y - p.previousY) * alpha;
      if (!this.paused) {
        trail.push({ x, y });
        if (trail.length > 27) trail.shift();
      }
      for (let i = 1; i < trail.length; i++) {
        g.lineStyle(
          2,
          weaponById(p.weapon).color,
          (i / trail.length) * 0.7,
        ).lineBetween(trail[i - 1].x, trail[i - 1].y, trail[i].x, trail[i].y);
      }
      g.fillStyle(0xffedb5, 0.14).fillCircle(x, y, 10);
      g.fillStyle(0xfff7db).fillCircle(x, y, p.weapon === "mega" ? 5 : 3);
      if (y < 5) {
        g.fillStyle(0xfff4d2).fillTriangle(
          clamp(x, 10, 1270),
          5,
          clamp(x, 10, 1270) - 5,
          14,
          clamp(x, 10, 1270) + 5,
          14,
        );
      }
    }
  }
  private drawEffects(delta: number): void {
    const g = this.effects;
    g.clear();
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += delta;
      const progress = f.age / 0.48;
      if (progress >= 1) {
        this.flashes.splice(i, 1);
        continue;
      }
      const radius =
        f.radius * (0.2 + Math.sin((progress * Math.PI) / 2) * 0.8);
      g.fillStyle(f.color, (1 - progress) * 0.65).fillCircle(f.x, f.y, radius);
      g.fillStyle(0xfff5cd, Math.max(0, 1 - progress * 3)).fillCircle(
        f.x,
        f.y,
        radius * 0.65,
      );
      g.lineStyle(3, f.color, 1 - progress).strokeCircle(
        f.x,
        f.y,
        radius * 1.15,
      );
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.vy += p.gravity * delta;
      g.fillStyle(p.color, p.life / p.max).fillRect(p.x, p.y, p.size, p.size);
    }
  }
}
