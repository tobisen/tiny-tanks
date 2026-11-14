import { CRATES, random, WORLD } from "./config";
import type { CrateTarget, Target } from "./physics";
import type { Terrain } from "./terrain";

export type Crate = CrateTarget;
export function placeCrates(
  seed: number,
  terrain: Terrain,
  tanks: readonly Target[],
): Crate[] {
  const rng = random(seed ^ 0x45ac72),
    count = 1 + Math.floor(rng() * 3);
  const candidates: number[] = [];
  for (let x = 100; x < WORLD.width - 100; x += 12) {
    if (
      tanks.every((t) => Math.abs(t.x - x) >= CRATES.spawnClearance) &&
      Math.abs(terrain.at(x - 10) - terrain.at(x + 10)) < 12
    )
      candidates.push(x);
  }
  const crates: Crate[] = [];
  for (let id = 0; id < count; id++) {
    const allowed = candidates.filter((x) =>
      crates.every((c) => Math.abs(c.x - x) > 48),
    );
    // A neighboring pair occasionally creates a deliberate chain opportunity.
    const neighbors = allowed.filter((x) =>
      crates.some((c) => Math.abs(c.x - x) >= 55 && Math.abs(c.x - x) <= 76),
    );
    const choices = id > 0 && neighbors.length ? neighbors : allowed;
    if (!choices.length) break;
    const x = choices[Math.floor(rng() * choices.length)];
    crates.push({ id, x, y: terrain.at(x), active: true });
  }
  return crates;
}
