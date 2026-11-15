# Tiny Tanks 2.3 — Battlefield Mayhem

Small tanks. Big trouble. An original browser artillery game inspired by the genre’s DOS-era classics, built with strict TypeScript, Phaser 3, and Vite. Tiny Tanks 2.3 adds varied battlefields, tactical Supply Drops, readable environmental events and Survival while preserving the fair AI and survivability improvements from 2.2.

## Play

**Quick Play** immediately starts one human against two Normal AI tanks, with a random visual theme and battlefield profile, movement, explosive crates, Supply Drops and Environmental Events enabled. Custom Match and local multiplayer retain configurable rules.

**Battlefields** separate geometry from visual themes: Rolling Hills offers open lanes; Mountain Ridge adds elevation; Crater Valley provides shallow cover; Broken Highlands creates narrow crests and valleys. Every profile works with Green Hills, Desert and Moon. Spawn areas have legal movement exits.

**Supply Drops** arrive by parachute after every four completed turns when a reachable location is available. Move into a landed crate to collect it. Repair kits restore 25% of starting health up to the maximum. Fuel packs add up to 64 fuel, capped at the normal tank capacity and 64 bonus fuel per turn. Ammunition crates restore one round to a depleted limited weapon; they never refill Mega Bombs. There are at most two active supplies, ten deliveries and three repair kits per match. Explosions destroy supplies without granting rewards. AI notices and pursues useful reachable supplies imperfectly, using the same movement and fuel rules as humans.

**Environmental Events** can be disabled in match settings. Occasional gusts announce strong wind before aiming; wind stays fixed during a shot and within the existing limit. Rare tremors mark a small area for 0.7 seconds before a shallow disturbance. Tremors settle nearby tanks and crates without dealing health damage. Events use seeded scheduling; Quick Play explicitly enables them.

**Survival** carries health and ammunition across generated encounters. Battles 1–2 use one Easy enemy, 3–4 one Normal enemy, 5–7 two Normal enemies, 8–10 two Hard enemies, and later battles three Hard enemies. Enemy health and damage never gain hidden bonuses. Between victories, recover up to 20 HP and one limited-ammo round; used Mega Bombs remain spent. Continue or bank the run after a win; defeat ends it. The score awards 1,000 per cleared battle, 250 per enemy eliminated, actual damage rounded to a point and 50 per accurate shot. Best streak, score and eliminations are saved locally. Existing arcade records remain compatible.

Combat feedback includes distinct direct impacts, subtle harmless near-pass flashes, damaged/critical tank states, elimination messages and a brief Final Duel cue. Presentation never pauses projectile physics or changes damage.

- One human vs 1–3 computer tanks, with Easy, Normal, and Hard AI.
- 2–4 players sharing one device.
- Six weapons: Standard Shell, Heavy Shell, Triple Shot, Cluster Bomb, Bunker Buster, and Mega Bomb.
- Destructible terrain, wind, direct hits, blast falloff, falling damage, health, match results, and instant rematches.
- Movement is enabled by default; it can be disabled for classic stationary artillery.
- Keyboard and touch controls remain supported, with A/D move left/right and large move buttons on touch devices.

## Controls

| Action        | Desktop             | Touch / mouse              |
| ------------- | ------------------- | -------------------------- |
| Aim           | Left / right arrows | Angle slider or hold − / + |
| Power         | Up / down arrows    | Power slider or hold − / + |
| Move          | A / D               | Move left / move right     |
| Choose weapon | 1–6                 | Loadout buttons            |
| Fire          | Space               | FIRE                       |
| Pause         | Escape              | Pause button               |

Movement uses a per-turn fuel meter. Fuel refreshes at the start of a tank’s turn; unused fuel is not carried over. Tanks follow terrain but cannot climb steep slopes, overlap other tanks, or leave the map. Movement remains available only during the active tank’s turn and is disabled while a shot or explosion sequence is resolving.

## Tactical combat balance

The underlying problem was a combination of direct-hit multipliers, high blast damage on close hits, and repeated blast/fall damage stacking in a single attack. Tiny Tanks 2.2 bounds direct-hit bonuses, keeps splash and direct damage from double counting, and clamps a per-target attack budget so one full-health tank is rarely removed by a single projectile or crate chain. Fall damage remains in the game, but it only applies after a legitimate landing and respects the same attack-resolution budget.

The default starting health remains configurable, and the total health/damage package is tuned to around 3–5 meaningful successful hits for a full-health standard shell exchange, with heavier weapons remaining rewarding but not routine one-shots.

## Develop and build

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
# After building, verify the complete browser suite:
npm run test:browser
# Reproduce the paired balance simulations:
npm run balance:mayhem
```

AI accuracy remains guarded by the existing deterministic real-physics calibration. New unit coverage checks profile safety, movement, supply bounds, event safety, Survival carryover and damage budgets. Playwright separates production/PWA regression flows from controlled scenarios on an opt-in development harness; that harness is removed from the production build.

The [paired balance report](docs/mayhem-balance.json) covers 48 Normal-AI simulations across four profiles, three themes and two seeds, comparing new systems off/on. All finished within the 120-shot bound, with no full-health single-attack eliminations. The 24 enabled matches averaged 42.79 turns versus 42.33 for their paired controls (about 1.1% longer). These are deterministic simulation results, not human win-rate or physical-device performance claims.


## GitHub Pages

The deployment flow remains the same as prior versions; the build is still generated for the repository base path and the bundled Vite PWA remains offline-compatible.

Browser checks emulate mobile touch and orientation; physical-phone performance has not been benchmarked.

Release validation: 112 unit tests passed; the complete 16-test Playwright suite passed twice consecutively against `/tiny-tanks/` with no retries. Typecheck, strict browser-test compilation, production build and PWA generation passed. The paired balance sample completed all 48 matches without a full-health single-attack elimination.
