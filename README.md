# Tiny Tanks — Arcade Edition

Small tanks. Big trouble. An original browser artillery game inspired by the genre’s DOS-era classics, built with strict TypeScript, Phaser 3, and Vite. Tiny Tanks 2.2 adds limited tactical repositioning, fuel-based tank movement, and a more forgiving damage model while preserving the fast arcade feel.

## Play

**2.2 — Tactical Combat:** limited movement is enabled by default, with a move-turn fuel system, terrain following, slope limits, and a capped per-attack damage budget to prevent routine full-health one-shots. Quick Play keeps the classic feel while allowing a small but meaningful repositioning window. Standard shells, heavy shots, cluster bombs, bunker busters, triple shots, and mega bombs all remain in the roster, but health and damage scaling now favor multiple meaningful exchanges instead of single-hit eliminations.

**Quick Play** starts one human against two Normal AI tanks, with a random theme, wind, explosive crates, and tank movement enabled by default. Custom solo and local games remain available. Aiming speed, the short trajectory preview, reduced motion, and the optional movement toggle are configurable.

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
```

## GitHub Pages

The deployment flow remains the same as prior versions; the build is still generated for the repository base path and the bundled Vite PWA remains offline-compatible.
