# Tiny Tanks 2.4.0 — Arsenal & Chaos

## Baseline

Inspected baseline: `de167fa`, package version **2.3.0**. Source and regression tests contained the six-weapon Phaser heightmap engine, tactical movement/fuel, difficulty-specific imperfect AI and shot memory, aggregate damage limiting, explosive crates, four terrain profiles, supply delivery/collection, environmental warnings, Survival carryover/records, local multiplayer and a Vite PWA deployed through GitHub Actions to Pages. No prerequisite rebuild was required.

## Changes

- Four data-driven weapons: Napalm (22 blast damage, 27 radius, three subsequent fire intervals), Bouncing Betty (49 damage, 47 radius, at most three reflections retaining 62% velocity), Air Strike (five 19-damage shells, 29 radius, 0.55-second warning), Seismic Charge (14 direct blast damage, 42 damage radius, 88 terrain radius with deeper excavation).
- All six existing weapon definitions remain unchanged. Immediate blast, direct, multi-projectile, crate-chain and fall damage use one per-target budget frozen at launch. Incoming shield absorption consumes this budget too. Fire adds at most 5 per target per completed subsequent action, with a 15-point lifetime cap per zone. No damage depends on time spent aiming.
- Energy Shield: 30% of starting HP, one initial charge, consumes an action, expires after the owner's next action or on depletion. Weapon/crate/fire damage is absorbed; fall damage bypasses it. At most one active shield. S and a large mouse/touch button activate it.
- Four optional Survival shop categories: ammunition, repair, fuel reserve and shield charge. Costs and resource limits are visible. Credits come from wins and bounded performance rewards. Transactions debit immediately; resources carry into the next encounter once. Free 2.3 recovery remains. Versioned local shop checkpoints safely resume between victories. Defeat ends the run; no permanent upgrades or external service.
- Five deterministic open challenges, finite ammunition, explicit objectives, immediate restart, success/failure panels and optional best-shot records. Puzzle encounters omit passive opponent turns; Last Stand uses normal enemy AI.
- AI uses the new weapon roles, shared bounce physics, imperfect Air Strike targets, legal hazard avoidance and limited shields. Search limits remain 60/140/260 candidates. Two-row ten-weapon selector, 1–9/0 shortcuts, distinct procedural icons/colors/trails/sounds, visible fire lifetime bars and shields, dismissible locally remembered guidance. Existing reduced-motion and particle limits remain.
- Package metadata drives visible version and `release.json`. Pages Actions gate publication on tests/build plus two complete browser runs. Production fixtures remain excluded. Existing settings/statistics/achievement/Survival record keys are preserved.

## Demonstrated challenge solutions

These starting shots are deterministic test routes, not aiming assistance injected into gameplay. Angles use the ordinary 0° right / 90° up convention.

| Challenge | Angle | Power | Successful route |
| --- | ---: | ---: | --- |
| Precision | 2° | 62% | One shell eliminates the 12 HP target |
| Ricochet | 2° | 58% | Betty reflects twice before damaging the protected target |
| Demolition | 10° | 92% | One Seismic Charge lowers the marked ridge by at least 60 pixels |
| Last Stand | 2° | 80% | Two shells, with the ordinary AI turn between them, defeat the opponent |
| Chain Reaction | 2° | 52% | Hit the first crate; the four-crate chain reaches the marked objective |

`npm run verify:challenges` reproduces these routes. Unit tests also exhaust ammunition to demonstrate failure and recreate each initial layout for restart consistency. Browser tests complete every route through real controls, verify failure/restart, and test touch Air Strike confirmation.

## Validation and measurements

The focused unit suite contains 154 passing tests. The complete browser suite contains 28 scenarios, covering the ten-weapon renderer, fire lifetime, bounded bouncing, Air Strike, Seismic deformation, shield turn/absorption, shop transactions/checkpoint restoration, all five challenges, mobile weapon selection, Quick Play, legal supply movement, weather, match results/rematches, old local data and production offline reload. Both final local release runs passed **28/28** consecutively against `/tiny-tanks/`, with zero retries. Unit tests passed **154/154**; app/browser typechecks, production build, PWA generation, both balance audits and all controlled challenge solutions passed. Typecheck and separate strict TypeScript compilation of browser tests are required alongside the production build/PWA generation.

The committed [paired Arsenal simulation](arsenal-balance.json) audits 48 matches, with four profiles × three themes × two seeds for each of two rulesets. All finish within 120 actions. Expanded-arsenal matches average 41.29 turns, compared with 50.13 with new ammunition and shields disabled. Both groups have zero full-health single-action eliminations. Every action audits damage plus shield absorption, allowing only the separately configured maximum-five persistent interval. All ten weapons are selected; six shield actions and 115 terrain bounces occur in the expanded-arsenal sample.

Measurements use Node 20.20.0 on the development machine. Normal AI decisions averaged 7.43 ms with an 11.27 ms p95 in the recorded run. These desktop CPU observations are not device frame-rate guarantees. Air Strike has exactly five projectile simulations; fire zones cap at three; terrain changes remain localized; existing particles cap at 170 for coarse pointers and 300 otherwise. Browser QA emulates touch and orientation.

## Limits

No physical-phone tests or human fun/win-rate study were performed. Survival checkpoints resume the between-battle shop; in-progress encounters are not serialized. The deterministic simulation compares the current engine with six-weapon inventory against the current expanded inventory, rather than executing an old compiled release. A public deployment is verified separately using the Actions result, `release.json` commit/version and the served hashed assets; a successful HTTP status alone is insufficient.

## Follow-up: upgrades from cached versions

The initial release verified clean installations and offline reloads, but missed upgrades from an existing 2.2 cache. Its inherited prompt-mode registration had no update prompt handler. A newer worker could remain waiting behind another open tab, so a reload continued to show the cached release.

The follow-up activates updated offline assets without requiring old tabs to close. The current client intercepts reload requests and presents an update notice; it never reloads a running match automatically. Online/focus events check for newer assets. A local-origin browser regression reproduces a cached 2.2 navigation with another old tab open, upgrades through the real production worker, preserves local records, and reloads offline. Another regression verifies that a future update keeps an active match intact until the player chooses to update from the menu. The complete browser suite now has 30 scenarios.

Follow-up local validation: 154 unit tests, both typechecks and production build passed. The two upgrade scenarios passed three consecutive repetitions, then the complete 30-scenario suite passed twice (30/30 each, zero retries).

The first follow-up CI run passed both cache regressions but exposed the shared 60-second timeout in the ten-weapon renderer loop (29/30 scenarios passed). That loop is now ten independent bounded cases, retaining every weapon assertion and zero retries. The expanded suite has 39 scenarios; this isolates one projectile resolution per timeout rather than increasing timeouts or relying on runner speed.

After isolating weapon scenarios, both complete local runs passed 39/39 with zero retries; browser-test typecheck passed.
