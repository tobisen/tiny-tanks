# Tiny Tanks 2.4 — Arsenal & Chaos

Small tanks. Big trouble. An original browser artillery game inspired by the genre’s DOS-era classics, built with strict TypeScript, Phaser 3, and Vite. Tiny Tanks 2.4 adds four distinct weapons, Energy Shields, an optional Survival field shop and five deterministic tactical challenges. It preserves the 2.3 battlefields, Supply Drops, events and Survival, plus fair aiming and the 2.2 damage limits.

## Play

**Quick Play** immediately starts one human against two Normal AI tanks, with a random visual theme and battlefield profile, movement, explosive crates, Supply Drops and Environmental Events enabled. Custom Match and local multiplayer retain configurable rules.

**Battlefields** separate geometry from visual themes: Rolling Hills offers open lanes; Mountain Ridge adds elevation; Crater Valley provides shallow cover; Broken Highlands creates narrow crests and valleys. Every profile works with Green Hills, Desert and Moon. Spawn areas have legal movement exits.

**Supply Drops** arrive by parachute after every four completed turns when a reachable location is available. Move into a landed crate to collect it. Repair kits restore 25% of starting health up to the maximum. Fuel packs add up to 64 fuel, capped at the normal tank capacity and 64 bonus fuel per turn. Ammunition crates restore one round to a depleted limited weapon; they never refill Mega Bombs. There are at most two active supplies, ten deliveries and three repair kits per match. Explosions destroy supplies without granting rewards. AI notices and pursues useful reachable supplies imperfectly, using the same movement and fuel rules as humans.

**Environmental Events** can be disabled in match settings. Occasional gusts announce strong wind before aiming; wind stays fixed during a shot and within the existing limit. Rare tremors mark a small area for 0.7 seconds before a shallow disturbance. Tremors settle nearby tanks and crates without dealing health damage. Events use seeded scheduling; Quick Play explicitly enables them.

**Survival** carries health and ammunition across generated encounters. Battles 1–2 use one Easy enemy, 3–4 one Normal enemy, 5–7 two Normal enemies, 8–10 two Hard enemies, and later battles three Hard enemies. Enemy health and damage never gain hidden bonuses. Between victories, recover up to 20 HP and one limited-ammo round. The optional field shop sells ammunition (25 credits, or 80 for Mega), repair (+20 HP for 35), a fuel reserve (20), and shield charges (30). Credits reward victories, actual damage, eliminations, accurate shots and chains, with capped bonuses. Continue skips the shop immediately. Ammunition stays within starting capacity, shields cap at three charges and fuel reserves at one. A versioned local checkpoint can resume the shop after a reload; leaving an active battle ends that encounter. Continue or bank the run after a win; defeat ends it. The score awards 1,000 per cleared battle, 250 per enemy eliminated, actual damage rounded to a point and 50 per accurate shot. Best streak, score and eliminations are saved locally. Existing arcade records remain compatible.

Combat feedback includes distinct direct impacts, subtle harmless near-pass flashes, damaged/critical tank states, elimination messages and a brief Final Duel cue. Presentation never pauses projectile physics or changes damage.

- One human vs 1–3 computer tanks, with Easy, Normal, and Hard AI.
- 2–4 players sharing one device.
- Ten weapons: Standard Shell, Heavy Shell, Triple Shot, Cluster Bomb, Bunker Buster, Mega Bomb, Napalm, Bouncing Betty, Air Strike and Seismic Charge.
- Energy Shield absorbs 30% of starting HP. One initial charge; activation consumes the turn.
- Five open challenges: Precision, Ricochet, Demolition, Last Stand and Chain Reaction, with local best-shot records and instant restart.
- Destructible terrain, wind, direct hits, blast falloff, falling damage, health, match results, and instant rematches.
- Movement is enabled by default; it can be disabled for classic stationary artillery.
- Keyboard and touch controls remain supported, with A/D move left/right and large move buttons on touch devices.

## Controls

| Action        | Desktop             | Touch / mouse              |
| ------------- | ------------------- | -------------------------- |
| Aim           | Left / right arrows | Angle slider or hold − / + |
| Power         | Up / down arrows    | Power slider or hold − / + |
| Move          | A / D               | Move left / move right     |
| Choose weapon | 1–9, 0              | Two-row loadout grid        |
| Energy Shield | S                   | Shield button              |
| Air Strike    | Target slider + Space | Tap battlefield + FIRE    |
| Fire          | Space               | FIRE                       |
| Pause         | Escape              | Pause button               |

Movement uses a per-turn fuel meter. Fuel refreshes at the start of a tank’s turn; unused fuel is not carried over. Tanks follow terrain but cannot climb steep slopes, overlap other tanks, or leave the map. Movement remains available only during the active tank’s turn and is disabled while a shot or explosion sequence is resolving.

## Arsenal and survivability

| Weapon | Starting rounds | Purpose |
| --- | --- | --- |
| Standard Shell | Unlimited | Reliable precision |
| Heavy Shell | 3 | Strong individual blast |
| Triple Shot | 3 | Three-shell spread |
| Cluster Bomb | 2 | Five-bomblet coverage |
| Bunker Buster | 2 | Penetrates ground |
| Mega Bomb | 1 | Scarce, wide blast and crater |
| Napalm | 2 | Small initial blast plus a marked burning area |
| Bouncing Betty | 3 | Up to three energy-losing terrain reflections |
| Air Strike | 2 | Confirm a horizontal target; five small shells collide normally |
| Seismic Charge | 2 | Low direct damage, wide/deep terrain deformation |

Immediate weapon, multi-projectile, crate and fall damage share one frozen per-target attack budget: 38% of health at launch, with a 12 HP finishing floor. A full-health 100 HP target therefore takes at most 38 immediate damage. Shield absorption consumes that same incoming budget. The UI reports actual HP lost and shield absorption separately.

Napalm is a separate limited persistent budget: 5 HP per completed subsequent action, up to 15 per zone per target across three intervals. Overlapping zones share the 5 HP interval cap. Aiming time never causes fire damage. At most three zones exist; move out before completing an action to escape the next interval. Bright ground and three small lifetime bars mark the danger.

Energy Shield absorbs weapon, splash, crate and fire damage; fall damage bypasses it. It lasts through the owner's next completed action, or until depleted. It cannot stack. AI uses the same activation, ammunition, physics, movement and fuel rules. New AI weapon weights retain difficulty-specific imperfect perception and execution; trajectory searches remain bounded at 60 / 140 / 260 candidates.

The five challenges use fixed heightmaps and legal placements. [Controlled solutions](docs/arsenal-release.md) are verified by both shared-physics unit tests and browser controls. Challenges do not gate any equipment.

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
npm run balance:arsenal
npm run verify:challenges
```

AI accuracy remains guarded by the existing deterministic real-physics calibration. Focused tests cover weapon budgets and ammunition, bounce termination, fire intervals, shields, shop transactions, checkpoint validation and all five challenge success/failure paths. Playwright uses observable state transitions and controlled development fixtures; the fixture API is absent from the production bundle.

The [Arsenal balance report](docs/arsenal-balance.json) compares 24 paired Normal-AI matches per ruleset across four profiles, three themes and two seeds. Every match finished within 120 actions, with no full-health single-attack elimination. The expanded arsenal averaged 41.29 turns versus 50.13 with new rounds and shields disabled. These are seeded desktop simulations, not human win rates or physical-device measurements. The historical 2.3 [Mayhem report](docs/mayhem-balance.json) remains available.

## GitHub Pages

The deployment flow remains the same as prior versions; the build is still generated for the repository base path and the bundled Vite PWA remains offline-compatible.

Browser checks emulate mobile touch and orientation; physical-phone performance has not been benchmarked.

The GitHub Actions release gate runs unit tests, both balance audits, typecheck, a production build and the complete browser suite twice. `release.json` exposes package version, the Actions commit and hashed asset names so the deployed build can be identified precisely. See [release notes and verification](docs/arsenal-release.md).
