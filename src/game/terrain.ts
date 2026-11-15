import { clamp, random, WORLD, type BattlefieldProfile } from "./config";
export class Terrain {
  readonly heights = new Float64Array(WORLD.width + 1);
  version = 0;
  constructor(seed: number, profile: BattlefieldProfile = "rolling") {
    const rng = random(seed);
    const a = rng() * 6.28,
      b = rng() * 6.28;
    for (let x = 0; x <= WORLD.width; x++) {
      // Keep the original gentle profile, including its seeded calibration.
      let height =
        422 +
        Math.sin(x / 187 + a) * 59 +
        Math.sin(x / 91 + b) * 25 +
        Math.sin(x / 400 + a) * 35;
      if (profile === "ridge")
        height =
          445 -
          150 * Math.exp(-(((x - 640) / 220) ** 2)) +
          Math.sin(x / 180 + a) * 47 +
          Math.sin(x / 80 + b) * 18;
      if (profile === "valley")
        height =
          395 +
          Math.sin(x / 230 + a) * 30 +
          42 * (0.5 + 0.5 * Math.cos(x / 48 + b)) ** 3;
      if (profile === "highlands")
        height =
          400 +
          Math.sin(x / 96 + a) * 63 +
          Math.sin(x / 210 + b) * 45 +
          Math.sin(x / 43 + a) * 12;
      this.heights[x] = clamp(
        height,
        profile === "rolling" ? 305 : 240,
        profile === "rolling" ? 515 : 535,
      );
    }
    if (profile !== "rolling") this.limitSlopes(0.9);
  }
  private limitSlopes(limit: number): void {
    for (let x = 1; x <= WORLD.width; x++)
      this.heights[x] = clamp(
        this.heights[x],
        this.heights[x - 1] - limit,
        this.heights[x - 1] + limit,
      );
    for (let x = WORLD.width - 1; x >= 0; x--)
      this.heights[x] = clamp(
        this.heights[x],
        this.heights[x + 1] - limit,
        this.heights[x + 1] + limit,
      );
  }
  prepareSpawns(positions: readonly number[]): void {
    for (const position of positions) {
      const y = this.at(position);
      for (let x = position - 64; x <= position + 64; x++) {
        if (x < 0 || x > WORLD.width) continue;
        const weight = clamp((64 - Math.abs(x - position)) / 44, 0, 1);
        this.heights[x] += (y - this.heights[x]) * weight;
      }
    }
    this.limitSlopes(0.82);
  }

  at(x: number): number {
    return this.heights[clamp(Math.round(x), 0, WORLD.width)];
  }
  crater(x: number, y: number, radius: number, verticalScale = 1): void {
    for (
      let i = Math.max(0, Math.floor(x - radius));
      i <= Math.min(WORLD.width, Math.ceil(x + radius));
      i++
    ) {
      const dx = i - x;
      const floor =
        y + Math.sqrt(Math.max(0, radius * radius - dx * dx)) * verticalScale;
      // A heightmap removes only ground actually reached by the blast.
      if (
        y - Math.sqrt(Math.max(0, radius * radius - dx * dx)) <=
        this.heights[i]
      )
        this.heights[i] = Math.min(
          WORLD.height - 12,
          Math.max(this.heights[i], floor),
        );
    }
    this.version++;
  }
}
