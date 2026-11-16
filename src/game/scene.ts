import Phaser from "phaser";
import { chooseSupplyMove, type SupplyMove } from "./ai-movement";
import { availableSupply } from "./supplies";
import { ENVIRONMENT } from "./config";
import { chooseShot, fireAIShot } from "./ai";
import { AI_RULES, AI_SKILLS } from "./ai-config";
import { AudioManager } from "./audio";
import {
  clamp,
  DEFAULT_SETTINGS,
  INPUT_SPEED,
  random,
  THEMES,
  WORLD,
  type Settings,
} from "./config";
import { Match, type GameEvent, type Tank } from "./match";
import { integrate, launch } from "./physics";
import { ARSENAL, weaponById } from "./weapons";
import { CombatEffects } from "./effects";

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
  private effects!: CombatEffects;
  private supplyGraphics!: Phaser.GameObjects.Graphics;
  private aiMove?: SupplyMove;
  private aiMoveChecked = false;
  private duelTime = 0;
  private crateGraphics!: Phaser.GameObjects.Graphics;
  private scars: { x: number; radius: number }[] = [];
  private originalTerrain = new Float64Array(WORLD.width + 1);
  private floating = new Set<Phaser.GameObjects.Text>();
  private touchHolds = new Map<
    number,
    { axis: "angle" | "power"; direction: number }
  >();
  private holdTime = 0;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private projectileGraphics!: Phaser.GameObjects.Graphics;
  private tankViews: TankView[] = [];
  private terrainVersion = -1;
  private accumulator = 0;
  private aiClock = 0;
  private aiSettled = 0;
  private aiHudClock = 0;
  private aiShot?: ReturnType<typeof chooseShot>;
  private trails = new Map<number, { x: number; y: number }[]>();
  private ambient = 0;
  private toast?: Phaser.GameObjects.Text;
  private held = new Set<string>();
  private moveHeld = new Set<string>();
  private touchMove = new Map<number, -1 | 1>();
  constructor() {
    super("battle");
  }
  create(): void {
    this.background = this.add.graphics();
    this.cloudGraphics = this.add.graphics();
    this.terrainGraphics = this.add.graphics();
    this.aimGraphics = this.add.graphics();
    this.projectileGraphics = this.add.graphics();
    this.crateGraphics = this.add.graphics().setDepth(3);
    this.supplyGraphics = this.add.graphics().setDepth(6);
    this.effects = new CombatEffects(this.add.graphics().setDepth(10));
    window.addEventListener("keydown", (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.matches("input,select") ||
        document.querySelector("dialog[open]")
      )
        return;
      this.held.add(event.code);
      if (event.code === "KeyA" || event.code === "KeyD") {
        this.moveHeld.add(event.code);
      }
      if (event.code === "KeyA" && !event.repeat) this.move(-1);
      if (event.code === "KeyD" && !event.repeat) this.move(1);
    });
    window.addEventListener("keyup", (event: KeyboardEvent) => {
      this.held.delete(event.code);
      if (event.code === "KeyA" || event.code === "KeyD") {
        this.moveHeld.delete(event.code);
      }
    });
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.clearInput());
    this.startMatch({ ...DEFAULT_SETTINGS }, true);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.canAim && this.match.current.weapon === "airstrike") {
        this.match.selectAirTarget(pointer.worldX);
        this.soundFX.select(8);
        this.onChange();
      }
    });
    this.onReady();
  }
  startMatch(settings: Settings, demo = false, seed?: number, supplied?: Match): void {
    this.match = supplied ?? new Match({ ...settings }, seed);
    this.demo = demo;
    this.paused = false;
    this.aiClock = 0;
    this.aiSettled = 0;
    this.aiHudClock = 0;
    this.aiShot = undefined;
    this.aiMove = undefined;
    this.aiMoveChecked = false;
    this.accumulator = 0;
    this.duelTime = 0;
    this.effects.clear();
    this.scars = [];
    this.originalTerrain.set(this.match.terrain.heights);
    this.cameras.main.setScroll(0, 0);
    this.cameras.main.shakeEffect.reset();
    for (const text of this.floating) {
      this.tweens.killTweensOf(text);
      text.destroy();
    }
    this.floating.clear();
    this.trails.clear();
    this.clearInput();
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
    if (this.match.fire()) {
      this.clearInput();
      this.onChange();
    }
  }
  setAim(angle: number, power: number): void {
    if (!this.canAim) return;
    this.soundFX.aim();
    this.match.current.angle = clamp(angle, 0, 180);
    this.match.current.power = clamp(power, 0, 100);
    this.onChange();
  }
  clearInput(): void {
    this.held.clear();
    this.touchHolds.clear();
    this.holdTime = 0;
    this.moveHeld.clear();
    this.touchMove.clear();
  }
  holdAim(pointer: number, axis: "angle" | "power", direction: number): void {
    if (!this.canAim) return;
    this.soundFX.unlock();
    this.touchHolds.set(pointer, { axis, direction });
    this.holdTime = 0;
    this.setAim(
      this.match.current.angle + (axis === "angle" ? direction : 0),
      this.match.current.power + (axis === "power" ? direction : 0),
    );
  }
  releaseAim(pointer: number): void {
    this.touchHolds.delete(pointer);
  }
  move(direction: -1 | 1): void {
    if (
      this.demo ||
      this.paused ||
      this.match.phase !== "aim" ||
      this.match.current.ai ||
      !this.match.settings.movement
    )
      return;
    this.match.move(direction, 1 / 60);
    this.onChange();
  }
  holdMove(pointer: number, direction: -1 | 1): void {
    if (this.canAim) this.touchMove.set(pointer, direction);
  }
  releaseMove(pointer: number): void {
    this.touchMove.delete(pointer);
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
    g.fillStyle(t.sky).fillRect(0, -200, WORLD.width, 200);
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
    if (this.match.settings.theme === "desert")
      for (let i = 0; i < 5; i++) {
        const x = 60 + i * 270,
          y = 330 + (i % 2) * 35;
        g.fillStyle(t.far, 0.8).fillPoints(
          [
            { x: x - 35, y: y + 65 },
            { x: x - 22, y },
            { x: x + 18, y },
            { x: x + 44, y: y + 65 },
          ],
          true,
        );
        g.fillStyle(t.sun, 0.13).fillRect(x - 22, y, 40, 4);
      }
    if (this.match.settings.theme === "moon") {
      for (let i = 0; i < 12; i++) {
        const x = 65 + i * 106,
          y = 385 + Math.sin(i * 3) * 30;
        g.lineStyle(2, 0xbac3de, 0.13).strokeEllipse(
          x,
          y,
          25 + (i % 3) * 12,
          6,
        );
      }
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
        Math.min(
          WORLD.height,
          Math.max(
            terrain.at(x),
            this.originalTerrain[x] + 59 + Math.sin(x / 70) * 12,
          ),
        ),
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
        y = 300 + rng() * 340;
      if (y < 636 && y > terrain.at(x) + 8) {
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
    for (const scar of this.scars) {
      g.lineStyle(3, t.deep, 0.8);
      g.beginPath();
      for (
        let x = Math.max(0, scar.x - scar.radius);
        x <= Math.min(WORLD.width, scar.x + scar.radius);
        x += 2
      ) {
        const y = terrain.at(x) + 4;
        if (x <= Math.max(0, scar.x - scar.radius) + 1) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
    // Decorative rocks follow the surface and never participate in collision.
    for (let i = 0; i < 8; i++) {
      const x = 75 + i * 155 + (rng() - 0.5) * 50,
        y = terrain.at(x);
      if (
        this.match.tanks.some((t) => Math.abs(t.x - x) < 35) ||
        this.match.crates.some((c) => Math.abs(c.x - x) < 28)
      )
        continue;
      g.fillStyle(t.deep).fillTriangle(x - 10, y, x - 5, y - 8, x + 9, y);
      g.fillStyle(t.grass, 0.35).fillTriangle(
        x - 7,
        y - 2,
        x - 4,
        y - 7,
        x + 1,
        y - 2,
      );
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
    if (tank.shield > 0) {
      g.fillStyle(0x86e5ff, 0.12).fillCircle(tank.x, view.y - 13, 30);
      g.lineStyle(2.5, 0x86e5ff, 0.85).strokeCircle(tank.x, view.y - 13, 30);
      g.lineStyle(3, 0xc5f5ff).lineBetween(tank.x - 19, view.y - 47, tank.x - 19 + 38 * tank.shield / (this.match.settings.health * ARSENAL.shieldFraction), view.y - 47);
    }
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
        y -
          51 +
          (this.match.settings.reducedMotion
            ? 0
            : Math.sin(this.ambient * 3) * 3),
        x - 5,
        y -
          59 +
          (this.match.settings.reducedMotion
            ? 0
            : Math.sin(this.ambient * 3) * 3),
        x + 5,
        y -
          59 +
          (this.match.settings.reducedMotion
            ? 0
            : Math.sin(this.ambient * 3) * 3),
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
    g.lineStyle(1, 0x102b29, 0.45).lineBetween(x - 15, y - 10, x + 14, y - 10);
    g.fillStyle(0xe5eac5, 0.7)
      .fillRect(x - 14, y - 13, 3, 3)
      .fillRect(x + 11, y - 13, 3, 3);
    g.lineStyle(1, 0x28433b).lineBetween(
      x - 7,
      y - 21,
      x - 8,
      y - 32 - tank.id * 2,
    );
    g.fillStyle(color).fillRect(x - 10, y - 33 - tank.id * 2, 4, 3);
    g.fillStyle(0x102b29, 0.45).fillRect(x - 4, y - 18, 6, 3);
    const healthRatio = tank.health / this.match.settings.health;
    if (healthRatio < 0.7) {
      g.lineStyle(2, 0x243632, 0.8).lineBetween(x - 10, y - 18, x - 4, y - 12);
      g.lineBetween(x + 3, y - 14, x + 8, y - 10);
    }
    if (healthRatio < 0.3) {
      const flicker = this.match.settings.reducedMotion
        ? 0.7
        : 0.4 + Math.sin(this.ambient * 13 + tank.id) * 0.3;
      g.fillStyle(0xffbe78, flicker).fillRect(x + 10, y - 15, 3, 3);
    }
    if (healthRatio < 0.7) {
      g.fillStyle(0x25332f, 0.25).fillCircle(
        x - 9,
        y -
          29 -
          (this.match.settings.reducedMotion
            ? 0
            : Math.sin(this.ambient * 2) * 4),
        5,
      );
    }
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
    this.effects.burst(x, y, count, color, strength);
  }
  private drawCrates(): void {
    const g = this.crateGraphics;
    g.clear();
    for (const c of this.match.crates) {
      if (!c.active) continue;
      const x = c.x,
        y = c.y;
      g.fillStyle(0x173331, 0.2).fillEllipse(x, y + 3, 30, 8);
      g.fillStyle(0xb8543a).fillRect(x - 11, y - 21, 22, 21);
      g.fillStyle(0xffbd78)
        .fillRect(x - 11, y - 21, 22, 3)
        .fillRect(x - 11, y - 3, 22, 3)
        .fillRect(x - 11, y - 21, 3, 21)
        .fillRect(x + 8, y - 21, 3, 21);
      g.lineStyle(2, 0x693b32)
        .lineBetween(x - 7, y - 17, x + 6, y - 5)
        .lineBetween(x + 7, y - 17, x - 6, y - 5);
      g.fillStyle(0xffe2a4).fillTriangle(x, y - 17, x - 5, y - 7, x + 5, y - 7);
      g.fillStyle(0x7a3b2d)
        .fillRect(x - 1, y - 14, 2, 4)
        .fillRect(x - 1, y - 9, 2, 1);
      g.fillStyle(
        0xffd58c,
        this.match.settings.reducedMotion
          ? 0.7
          : 0.55 + Math.sin(this.ambient * 3 + c.id) * 0.25,
      ).fillRect(x - 2, y - 26, 4, 3);
    }
  }
  private drawSupplies(): void {
    const g = this.supplyGraphics;
    g.clear();
    for (const zone of this.match.fires) {
      for (let i = 0; i < zone.remaining; i++)
        g.fillStyle(0xffd076).fillRect(zone.x - 9 + i * 7, this.match.terrain.at(zone.x) - 20, 5, 3);
      g.lineStyle(5, 0xff713e, 0.65);
      for (let x = Math.max(0, zone.x - ARSENAL.fireRadius); x <= Math.min(WORLD.width, zone.x + ARSENAL.fireRadius); x += 10) {
        const y = this.match.terrain.at(x);
        const h = this.match.settings.reducedMotion ? 9 : 8 + Math.sin(this.ambient * 7 + x) * 4;
        g.fillStyle(0xffa34f, 0.8).fillTriangle(x - 3, y - 2, x + 3, y - 2, x + 1, y - h);
        g.lineBetween(x - 5, y, x + 5, y);
      }
    }
    for (const drop of this.match.supplies) {
      if (!availableSupply(drop)) continue;
      const { x, y } = drop;
      if (drop.state === "falling") {
        g.lineStyle(1.5, 0xf6f4d8).lineBetween(x - 22, y - 45, x - 9, y - 16);
        g.lineBetween(x + 22, y - 45, x + 9, y - 16);
        g.fillStyle(0xf6f4d8).fillEllipse(x, y - 48, 48, 20);
        g.fillStyle(0xe49f6b).fillTriangle(
          x - 7,
          y - 57,
          x + 7,
          y - 57,
          x,
          y - 39,
        );
      }
      const tint = { repair: 0xa6eda9, fuel: 0xffd07a, ammo: 0xafd8ff }[
        drop.kind
      ];
      g.fillStyle(0x142b30).fillRoundedRect(x - 12, y - 23, 24, 23, 3);
      g.lineStyle(2, tint).strokeRoundedRect(x - 12, y - 23, 24, 23, 3);
      g.fillStyle(tint);
      if (drop.kind === "repair") {
        g.fillRect(x - 2, y - 19, 4, 15).fillRect(x - 7, y - 14, 14, 4);
      } else if (drop.kind === "fuel") {
        g.fillRoundedRect(x - 6, y - 17, 12, 12, 2);
        g.lineStyle(2, tint).strokeRect(x - 3, y - 21, 7, 4);
        g.lineStyle(1, 0x142b30).lineBetween(x - 4, y - 14, x + 4, y - 7);
      } else {
        g.fillRect(x - 4, y - 14, 8, 9).fillTriangle(
          x - 4,
          y - 14,
          x + 4,
          y - 14,
          x,
          y - 21,
        );
      }
    }
    if (this.match.tremor) {
      const { x } = this.match.tremor,
        y = this.match.terrain.at(x);
      g.lineStyle(3, 0xffcb7a, 0.8).strokeEllipse(
        x,
        y - 1,
        ENVIRONMENT.tremorRadius * 2,
        15,
      );
      g.fillStyle(0xffcb7a).fillTriangle(
        x,
        y - 45,
        x - 7,
        y - 31,
        x + 7,
        y - 31,
      );
    }
  }
  private handleEvent(event: GameEvent): void {
    if (event.type === "shield") {
      const tank = this.match.tanks[event.id];
      if (event.action === "activate") {
        this.announce(`${tank.name.toUpperCase()} · SHIELD ${event.amount}`);
        this.effects.flash(tank.x, tank.y - 13, 39, 0x86e5ff);
        this.soundFX.select(7);
      } else if (event.action === "absorb") {
        this.announce(`${tank.name.toUpperCase()} · ${+event.amount.toFixed(2)} ABSORBED`);
        this.effects.flash(tank.x, tank.y - 13, 30, 0x86e5ff, 0.2);
        this.soundFX.aim();
      }
    } else if (event.type === "bounce") {
      this.effects.flash(event.x, event.y, 16, 0x70efcf, 0.2);
      this.soundFX.select(5);
    } else if (event.type === "air-warning") {
      this.soundFX.select(8);
    } else if (event.type === "shot") {
      const w = weaponById(event.weapon),
        tank = this.match.current,
        r = (tank.angle * Math.PI) / 180;
      const x = event.x + Math.cos(r) * 29,
        y = event.y - Math.sin(r) * 29;
      this.effects.flash(x, y, 12 + w.recoil, w.color);
      this.addParticles(x, y, 9, 0xffdc86, 0.6);
      this.tankViews[tank.id].recoil = w.recoil;
      this.soundFX.fire(event.weapon);
    } else if (event.type === "blast") {
      const w = weaponById(event.weapon);
      const color = event.crate ? 0xffc26f : w.color;
      this.effects.explosion(
        event.x,
        event.y,
        event.radius,
        color,
        THEMES[this.match.settings.theme].soil,
        event.underground,
      );
      this.scars.push({ x: event.x, radius: event.radius });
      if (this.scars.length > 24) this.scars.shift();
      this.terrainVersion = -1;
      this.soundFX.explosion(event.weapon, event.radius, event.crate);
      if (!this.match.settings.reducedMotion)
        this.cameras.main.shake(
          event.crate ? 150 : 110 + w.recoil * 7,
          event.crate ? 0.003 : w.shake,
        );
    } else if (event.type === "supply") {
      if (event.action === "pickup") {
        this.announce(event.text);
        this.effects.flash(event.drop.x, event.drop.y - 15, 30, 0xe6f8ae);
        this.soundFX.select(2);
      } else if (event.action === "drop")
        this.announce(event.text.toUpperCase());
    } else if (event.type === "environment") {
      this.announce(event.text.toUpperCase());
      if (event.action === "tremor") {
        this.terrainVersion = -1;
        this.effects.burst(
          event.x,
          this.match.terrain.at(event.x),
          12,
          0xb5ad90,
          0.5,
          "dirt",
        );
        this.soundFX.boom(0.08, 0.2);
        if (!this.match.settings.reducedMotion)
          this.cameras.main.shake(120, 0.001);
      }
    } else if (event.type === "direct-hit") {
      // Visual emphasis leaves simulation timing and player input untouched.
      this.effects.flash(event.x, event.y, 37, 0xffffff);
      this.effects.burst(event.x, event.y, 10, 0xffe6a7, 0.45);
      this.tankViews[event.id].hit = 0.22;
      this.tankViews[event.id].recoil = 7;
      this.soundFX.directHit();
    } else if (event.type === "near-miss") {
      this.effects.flash(event.x, event.y, 14, 0xd6e5df, 0.2);
    } else if (event.type === "duel") {
      this.duelTime = 1.8;
      this.announce("FINAL DUEL · TWO TANKS. ONE HILL.");
      this.soundFX.duel();
    } else if (event.type === "damage") {
      this.tankViews[event.id].hit = 0.18;
      this.soundFX.hit();
      const text = this.add
        .text(
          event.x,
          event.y - 10,
          `${event.fall ? "↓ " : event.burn ? "♨ −" : "−"}${+event.amount.toFixed(2)}`,
          {
            fontFamily: "monospace",
            fontStyle: "bold",
            fontSize: "24px",
            color: "#fff4d0",
            stroke: "#543d36",
            strokeThickness: 4,
          },
        )
        .setOrigin(0.5)
        .setDepth(20);
      this.floating.add(text);
      this.tweens.add({
        targets: text,
        y: text.y - (this.match.settings.reducedMotion ? 0 : 53),
        alpha: 0,
        duration: 1150,
        ease: "Cubic.Out",
        onComplete: () => {
          this.floating.delete(text);
          text.destroy();
        },
      });
    } else if (event.type === "death") {
      this.duelTime = 1.2;
      this.announce(
        `${this.match.tanks[event.id].name.toUpperCase()} ELIMINATED`,
      );
      this.addParticles(event.x, event.y, 30, 0xff927a, 1.3);
      this.effects.flash(event.x, event.y, 42, 0xff927a);
      this.effects.burst(event.x, event.y, 14, 0x344a40, 1.4, "debris");
      this.soundFX.boom(0.7, 0.65);
    } else if (event.type === "split") {
      this.addParticles(event.x, event.y, 14, 0xe3a0ec, 0.5);
      this.effects.flash(event.x, event.y, 24, 0xe3a0ec);
      this.soundFX.split();
    } else if (event.type === "penetrate") {
      this.effects.burst(
        event.x,
        event.y,
        20,
        THEMES[this.match.settings.theme].soil,
        0.9,
        "dirt",
      );
      this.soundFX.penetrate();
    } else if (event.type === "crate") {
      this.effects.burst(event.x, event.y, 12, 0xffbd78, 1.2, "debris");
      this.soundFX.crate();
    } else if (event.type === "chain") {
      this.announce(`${event.count}× CHAIN REACTION`);
      this.soundFX.crate(event.count);
    } else if (event.type === "turn") {
      this.clearInput();
      this.aiClock = 0;
      this.aiSettled = 0;
      this.aiHudClock = 0;
      this.aiShot = undefined;
      this.aiMove = undefined;
      this.aiMoveChecked = false;
      if (this.duelTime <= 0)
        this.announce(
          `${this.match.current.name.toUpperCase()}${this.match.current.ai ? " IS AIMING…" : ", YOU’RE UP"}`,
        );
    } else if (event.type === "win") {
      if (this.match.settings.mode === "local" || this.match.winnerId === 0)
        this.soundFX.victory();
      else this.soundFX.defeat();
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
    if (!this.paused) this.duelTime = Math.max(0, this.duelTime - delta);
    if (!this.paused && !this.match.settings.reducedMotion)
      this.ambient += delta;
    this.effects.reducedMotion = this.match.settings.reducedMotion;
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
        let horizontal =
          Number(this.held.has("ArrowLeft")) -
          Number(this.held.has("ArrowRight"));
        let vertical =
          Number(this.held.has("ArrowUp")) - Number(this.held.has("ArrowDown"));
        for (const hold of this.touchHolds.values()) {
          if (hold.axis === "angle") horizontal += hold.direction;
          else vertical += hold.direction;
        }
        if (horizontal || vertical) {
          this.holdTime += delta;
          const speed =
            INPUT_SPEED[this.match.settings.inputSpeed] *
            (this.holdTime > 0.45 ? 1.4 : 1);
          this.setAim(
            this.match.current.angle +
              clamp(horizontal, -1, 1) * delta * 40 * speed,
            this.match.current.power +
              clamp(vertical, -1, 1) * delta * 30 * speed,
          );
        } else this.holdTime = 0;
      }
      const moveDirection =
        Number(this.held.has("KeyD")) - Number(this.held.has("KeyA"));
      const touchDirection = [...this.touchMove.values()].reduce<number>(
        (sum, direction) => sum + direction,
        0,
      );
      const direction =
        this.match.phase === "aim" &&
        this.match.settings.movement &&
        !this.match.current.ai
          ? clamp(moveDirection + touchDirection, -1, 1)
          : 0;
      if (direction !== 0 && this.match.phase === "aim") {
        this.match.move(direction as -1 | 1, delta);
        this.onChange();
      }
      if (this.match.phase === "aim" && this.match.current.ai) {
        if (!this.aiMoveChecked) {
          this.aiMove = chooseSupplyMove(this.match);
          this.aiMoveChecked = true;
        }
        if (this.aiMove) {
          const drop = this.match.supplies.find(
            (s) => s.id === this.aiMove!.supplyId,
          );
          if (this.aiMove.supplyId === "hazard"
            ? Math.abs(this.match.current.x - this.aiMove.targetX) < 5 || !this.match.move(this.aiMove.direction, delta)
            : !drop || drop.state !== "landed" || !this.match.move(this.aiMove.direction, delta))
            this.aiMove = undefined;
          this.onChange();
        }
        if (!this.aiMove) this.aiClock += delta;
        if (
          !this.aiMove &&
          !this.aiShot &&
          this.aiClock > AI_RULES.preparationDelay
        ) {
          this.aiShot = chooseShot(this.match);
          this.match.current.weapon = this.aiShot.weapon;
          this.onChange();
        }
        if (this.aiShot) {
          const tank = this.match.current,
            reduced = this.match.settings.reducedMotion;
          tank.angle = reduced
            ? this.aiShot.angle
            : tank.angle +
              clamp(
                this.aiShot.angle - tank.angle,
                -delta * AI_RULES.turretSpeed,
                delta * AI_RULES.turretSpeed,
              );
          tank.power = reduced
            ? this.aiShot.power
            : tank.power +
              clamp(
                this.aiShot.power - tank.power,
                -delta * AI_RULES.powerSpeed,
                delta * AI_RULES.powerSpeed,
              );
          if (
            Math.abs(tank.angle - this.aiShot.angle) <
              AI_RULES.settledAimTolerance &&
            Math.abs(tank.power - this.aiShot.power) <
              AI_RULES.settledAimTolerance
          )
            this.aiSettled += delta;
          else this.aiSettled = 0;
          this.aiHudClock += delta;
          if (this.aiHudClock > 0.08) {
            this.aiHudClock = 0;
            this.onChange();
          }
          if (
            this.aiClock >
              AI_SKILLS[this.match.settings.difficulty].decisionDelay &&
            this.aiSettled > AI_RULES.aimPause
          ) {
            fireAIShot(this.match, this.aiShot);
            this.onChange();
          }
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
    this.drawCrates();
    this.drawSupplies();
    this.drawAim();
    this.drawProjectiles();
    this.effects.draw(this.paused ? 0 : delta, this.match.wind);
    // Follow only a lone high-flying shell, retaining every living tank in view.
    let cameraY = 0;
    if (
      !this.match.settings.reducedMotion &&
      this.match.phase === "flight" &&
      this.match.projectiles.length === 1
    ) {
      const p = this.match.projectiles[0],
        lowest = Math.max(
          ...this.match.tanks.filter((t) => t.health > 0).map((t) => t.y),
          0,
        );
      const room = Math.max(0, WORLD.height - lowest - 55);
      cameraY = -Math.min(90, room, Math.max(0, 40 - p.y) * 0.35);
    }
    if (!this.paused)
      this.cameras.main.scrollY = Phaser.Math.Linear(
        this.cameras.main.scrollY,
        cameraY,
        Math.min(1, delta * 4),
      );
  }
  private drawAim(): void {
    const g = this.aimGraphics;
    g.clear();
    const targetX = this.match.airWarning?.x ?? (this.canAim && this.match.current.weapon === "airstrike" ? this.match.airTarget : undefined);
    if (targetX !== undefined) {
      const y = this.match.terrain.at(targetX);
      g.lineStyle(2, 0xffde73, 0.9).lineBetween(targetX, 30, targetX, y);
      g.strokeEllipse(targetX, y - 5, 115, 18);
      g.lineBetween(targetX - 12, 45, targetX + 12, 45);
      for (let i = -2; i <= 2; i++) g.fillStyle(0xffde73).fillTriangle(targetX + i * 24, 66, targetX + i * 24 - 4, 58, targetX + i * 24 + 4, 58);
    }
    const marker = this.match.objectiveX;
    if (marker !== undefined) {
      const y = this.match.terrain.at(marker);
      g.lineStyle(2, 0xd5f577).strokeCircle(marker, y - 18, 22);
      g.lineBetween(marker - 30, y - 18, marker + 30, y - 18);
    }
    if (!this.canAim || !this.match.settings.preview || this.match.current.weapon === "airstrike") return;
    const tank = this.match.current,
      body = launch(
        tank.x,
        tank.y - 12,
        tank.angle,
        tank.power,
        weaponById(tank.weapon).speed,
      );
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
      g.fillStyle(weaponById(p.weapon).color).fillCircle(x, y, p.weapon === "mega" ? 5 : 4);
      if (p.weapon === "seismic") g.lineStyle(1, 0xffffff).strokeRect(x - 4, y - 4, 8, 8);
      if (p.weapon === "betty") g.lineStyle(1, 0xffffff).strokeCircle(x, y, 5);
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
}
