# Tiny Tanks 2.1 — Fair & Fun AI

Measured November 15, 2026, with Node 20.20.0 on the local development machine. Timings are desktop CPU measurements, not physical-phone benchmarks.

## What changed

The 2.0 planner used exact wind and target coordinates, searched about 610 candidates on Normal and 1,143 on Hard, maximized estimated damage across available weapons, and then added uniform error. Normal power varied by only ±1.35 points; Hard by ±0.325. It had no shot memory. Physics, damage and free-for-all targeting were already shared with players; no human-target flag advantage was found.

2.1 chooses a living opponent and a weighted, available weapon first. It plans with noisy target and wind estimates, then applies independent execution uncertainty. A stable personal bias makes opponents less mechanical. There are no forced misses, hit quotas, homing, outcome corrections or human-target preferences. The committed action uses the ordinary `Match.fire`/`tick` path. Shot memory comes from recorded actual impacts, is limited to the current match, and is discounted or invalidated by changes in wind, terrain and positions. It never removes execution uncertainty.

## Final profiles

Noise parameters are standard-deviation settings; individual Gaussian draws are clipped at 2.5σ. Execution combines a 25% personal component with independent variation, preserving approximately the configured variance. Skill weights are utility/confidence weights, not guaranteed probabilities. All parameters live in `src/game/ai-config.ts`.

| Parameter                             | Easy | Normal | Hard |
| ------------------------------------- | ---: | -----: | ---: |
| Angle uncertainty, degrees            |  5.5 |      3 |  1.3 |
| Power uncertainty, percentage points  |  9.5 |      5 |  2.2 |
| Wind estimate uncertainty, game units |    8 |    3.5 |  1.2 |
| Target position uncertainty, pixels   |   18 |     10 |    4 |
| Trajectory evaluation budget          |   60 |    140 |  260 |
| Target selection skill                |  .20 |    .65 |  .90 |
| Weapon selection skill                |  .20 |    .60 |  .90 |
| Memory accuracy                       |  .30 |    .62 |  .86 |
| Learning rate                         |  .20 |    .45 |  .65 |
| Maximum power correction              |    3 |      5 |    7 |
| Risk tolerance                        |  .38 |    .22 |  .13 |
| Crate awareness                       |  .10 |    .55 |  .95 |
| Minimum decision delay, seconds       |  .72 |    .66 |  .60 |

The turret and power display reach the committed action before firing. Reduced motion skips the rotation, retaining the short preparation pause. Quick Play remains one human versus two Normal competitors, with no teams or hidden handicaps.

## Method and outcomes

**432 fresh scenarios per difficulty per version (1,296 shots/version)** cover all combinations of three distances (220/500/900), three themes, three wind values (−18/0/+18), both firing directions, standard-only/full inventories, crates on/off, and enemy health 45/100. Terrain uses deterministic seeds. Every reported shot is executed by the real `Match` engine, including spread, clusters, penetration, crate chains, falls and swept collisions. The frozen 2.0 comparison planner comes from commit `69cd138`; it is never imported by the game.

A direct hit requires a real projectile-to-enemy-tank collision, once per trigger pull. Splash and crate damage do not count as direct hits. A near miss excludes direct hits and is within 60 world pixels of an enemy at launch. Mean miss includes direct hits as zero and uses the closest projectile impact/exit to launch-time enemy positions. Damage is actual enemy health removed, including falls, excluding self damage and overkill. Shots needing correction are non-direct shots more than 40 pixels away.

| Difficulty | Direct, 2.0 → 2.1 | Near miss, 2.1 | Mean miss, px | Damage/shot, 2.0 → 2.1 | Mean decision ms, 2.0 → 2.1 |
| ---------- | ----------------- | -------------: | ------------: | ---------------------- | --------------------------- |
| Easy       | 13.9% → 16.4%     |          14.8% |         150.9 | 12.0 → 12.2            | 6.88 → 2.81                 |
| Normal     | 43.1% → 22.7%     |          26.4% |          86.7 | 39.6 → 19.0            | 14.57 → 6.24                |
| Hard       | 56.9% → 45.4%     |          36.3% |          33.0 | 53.5 → 36.2            | 29.72 → 11.05               |

Normal p95 decision cost fell from **27.59 to 9.47 ms**. Standard-only direct rates were **12.5% / 17.6% / 42.6%**; mixed-inventory rates above include multi-projectile weapons. Easy's combined rate is slightly above the provisional 15% target; it was retained rather than imposing misses. In full-inventory scenarios, Easy selected standard shells 84.7% of the time. Normal and Hard used all six weapons; Mega Bombs accounted for only 3.2% and 4.2% of their full-inventory choices. Raw reports contain per-weapon counts, splash-only rates, correction counts and timing percentiles.

**90 mixed-skill, three-tank free-for-all matches/version** rotate skill assignments across positions and starting order, and cover every theme. Wins (Easy/Normal/Hard) changed from **2/41/47** to **12/21/57**. All matches finished, with no draws or turn-cap failures. Mean turns increased from **4.74 to 12.74**. There were 71 memory-guided corrections in 1,147 decisions.

A separate **432-attempt Normal learning study** replays identical post-shot positions with/without memory. In 93 eligible correction cases, memory improved 43 individual outcomes; mean miss was **93.0 px with memory versus 94.4 px without**. This is modest guidance, not perfect correction or a promise that each attempt improves.

## Reproduce and limits

```sh
npm ci
npm run calibrate:baseline
npm run calibrate
```

Reports default to `/tmp/tiny-tanks-ai-baseline.json` and `/tmp/tiny-tanks-ai-current.json`. Set `AI_REPORT`, `AI_SAMPLES`, or `AI_GAMES` to choose the output or sample sizes. Reference reports are [baseline](ai-calibration-baseline.json) and [2.1](ai-calibration-current.json). The calibration command checks broad skill/accuracy and match-completion invariants; unit tests also run a deterministic 216-scenario-per-skill guard.

Rates describe this scenario set, not fixed probabilities on every map or against humans. Cold-shot scenarios do not measure learning; the tournament and paired study do. Launch-time miss distance is less descriptive after a tank falls. These measurements describe 2.1, before the 2.2 damage cap; they are not new 2.2 damage or match-duration measurements.

In 2.2, the deterministic 216-scenario-per-skill unit guard retains the accuracy bounds above. A separate bounded scenario uses the ordinary Normal planner and real physics to observe a natural miss followed by direct damage in two exchanges. Normal and Hard also play complete unit-test matches on all three themes, asserting opponent kills and a winner within the turn bound. Browser coverage observes the same two exchanges, while a separate vertical self-hit fixture guarantees a reachable victory condition for results, records, both rematch buttons, and identical first-shot commitment after a same-map replay. No launch is altered to force an AI miss. See [2.2 release verification](release-2.2-validation.md). Physical-phone performance and subjective player win rates remain unmeasured.
