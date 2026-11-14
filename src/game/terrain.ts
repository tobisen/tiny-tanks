import { clamp, random, WORLD } from "./config";
export class Terrain {
  readonly heights = new Float64Array(WORLD.width + 1);
  version = 0;
  constructor(seed: number) {
    const rng = random(seed);
    const a = rng() * 6.28,
      b = rng() * 6.28;
    for (let x = 0; x <= WORLD.width; x++)
      this.heights[x] = clamp(
        422 +
          Math.sin(x / 187 + a) * 59 +
          Math.sin(x / 91 + b) * 25 +
          Math.sin(x / 400 + a) * 35,
        305,
        515,
      );
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
