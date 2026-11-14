import type Phaser from "phaser";
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  kind: "spark" | "dirt" | "debris";
  gravity: number;
}
interface Smoke {
  x: number;
  y: number;
  vx: number;
  life: number;
  max: number;
  radius: number;
}
interface Flash {
  x: number;
  y: number;
  radius: number;
  age: number;
  color: number;
  vertical: number;
}
/** Bounded, procedural combat effects. Gameplay never waits for particles or smoke. */
export class CombatEffects {
  reducedMotion = false;
  private particles: Particle[] = [];
  private smoke: Smoke[] = [];
  private flashes: Flash[] = [];
  private readonly capacity = matchMedia("(pointer:coarse)").matches
    ? 170
    : 300;
  constructor(private graphics: Phaser.GameObjects.Graphics) {}
  clear(): void {
    this.particles = [];
    this.smoke = [];
    this.flashes = [];
    this.graphics.clear();
  }
  flash(
    x: number,
    y: number,
    radius: number,
    color: number,
    vertical = 1,
  ): void {
    this.flashes.push({ x, y, radius, color, vertical, age: 0 });
  }
  burst(
    x: number,
    y: number,
    count: number,
    color: number,
    strength: number,
    kind: Particle["kind"] = "spark",
  ): void {
    const limit = this.reducedMotion ? count * 0.45 : count;
    for (let i = 0; i < limit && this.particles.length < this.capacity; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = (35 + Math.random() * 150) * strength,
        life = 0.35 + Math.random() * 0.7;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 55,
        life,
        max: life,
        size: 2 + Math.random() * (kind === "debris" ? 5 : 3),
        color,
        kind,
        gravity: kind === "spark" ? 110 : 240,
      });
    }
  }
  explosion(
    x: number,
    y: number,
    radius: number,
    color: number,
    soil: number,
    underground = false,
  ): void {
    this.flash(x, y, radius, color, underground ? 1.35 : 1);
    this.burst(x, y, radius * 0.3, 0xffd58c, radius / 62, "spark");
    this.burst(x, y, radius * 0.19, soil, radius / 60, "dirt");
    this.burst(x, y, Math.max(4, radius / 10), soil, radius / 70, "debris");
    for (
      let i = 0;
      i < (this.reducedMotion ? 2 : 5) && this.smoke.length < 24;
      i++
    ) {
      const life = 0.9 + Math.random() * 1.1;
      this.smoke.push({
        x: x + (Math.random() - 0.5) * radius,
        y: y - radius * 0.3,
        vx: (Math.random() - 0.5) * 15,
        life,
        max: life,
        radius: radius * (0.15 + Math.random() * 0.15),
      });
    }
  }
  draw(delta: number, wind: number): void {
    const g = this.graphics;
    g.clear();
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.smoke.splice(i, 1);
        continue;
      }
      p.x += (p.vx + wind * 0.15) * delta;
      p.y -= 13 * delta;
      p.radius += 7 * delta;
      const opacity = Math.sin((p.life / p.max) * Math.PI) * 0.18;
      g.fillStyle(0x263533, opacity).fillCircle(p.x, p.y, p.radius);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += delta;
      const progress = f.age / (0.32 + f.radius / 340);
      if (progress >= 1) {
        this.flashes.splice(i, 1);
        continue;
      }
      const radius =
        f.radius * (0.1 + Math.sin((progress * Math.PI) / 2) * 0.9);
      g.fillStyle(f.color, (1 - progress) * 0.63).fillEllipse(
        f.x,
        f.y,
        radius * 2,
        radius * 2 * f.vertical,
      );
      g.fillStyle(0xfff6d7, Math.max(0, 1 - progress * 3.5) * 0.9).fillCircle(
        f.x,
        f.y,
        radius * 0.65,
      );
      g.lineStyle(
        2 + f.radius / 70,
        f.color,
        (1 - progress) * 0.65,
      ).strokeEllipse(f.x, f.y, radius * 2.08, radius * 2.08 * f.vertical);
      if (f.radius > 65) {
        g.lineStyle(1, 0xffedc0, (1 - progress) * 0.3).strokeCircle(
          f.x,
          f.y,
          radius * 1.3,
        );
      }
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
      const alpha = Math.min(1, (p.life / p.max) * 1.6);
      if (p.kind === "spark")
        g.lineStyle(1.5, p.color, alpha).lineBetween(
          p.x,
          p.y,
          p.x - p.vx * 0.025,
          p.y - p.vy * 0.025,
        );
      else if (p.kind === "debris")
        g.fillStyle(p.color, alpha).fillTriangle(
          p.x - p.size,
          p.y,
          p.x + p.size,
          p.y + p.size,
          p.x,
          p.y - p.size,
        );
      else g.fillStyle(p.color, alpha).fillRect(p.x, p.y, p.size, p.size);
    }
  }
}
