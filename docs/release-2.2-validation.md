# Tiny Tanks 2.2 release verification

## Investigation

The former Normal browser scenario combined observing a natural miss, waiting for an elimination, and verifying same-map replay. Its 25-iteration loop counted 1.5-second sleeps, not completed human/AI exchanges. Once that loop stopped firing human shots, a longer rematch timeout could not advance the match.

Running seed 145 with two tanks, Normal difficulty, 75 HP, Green Hills, no wind or crates, and human shots at 45° / 20 power through the real simulation produces a natural miss on AI turn 2, a direct hit for 28.5 damage on AI turn 4, and a winner after the nineteenth human shot. The final elimination in that sequence is a human self-hit. This is not evidence that matches cannot finish, or a suitable fixture for demanding a quick AI elimination. The 2.2 attack cap also means a direct hit need not eliminate a healthy tank.

The failed Actions run additionally put the human flight and AI preparation under a single five-second launch poll, and sampled mobile canvas bounds before Phaser had fitted the new layout. These checks now wait for the relevant turn, launch, and layout states in sequence.

## Coverage by responsibility

- **Accuracy:** the existing deterministic unit calibration executes 216 scenarios per difficulty through real physics. Its distinct-difficulty, Normal direct-rate (10–34%), Hard fallibility, and damage-ordering assertions remain unchanged.
- **Natural misses and damage:** unit and browser scenarios execute exactly two ordinary Normal AI turns on seed 145. They require unchanged opponent health after the miss and 46.5 HP after the next shot. The unit scenario also requires an actual direct collision with the opponent; neither planner output nor projectile outcomes are forced.
- **AI elimination and completion:** Normal and Hard each play complete three-tank unit matches on Green Hills, Desert, and Moon, requiring real opponent kills, a completed match, and at most one survivor within the existing 90-shot bound.
- **Results and rematches:** a separate browser fixture uses vertical human self-hits. These use zero power (the ordinary minimum launch speed), guaranteeing a result within five human shots without relying on AI accuracy. The existing reduced-motion preference skips redundant turret animation here; the separate natural-miss scenario retains normal animation. It verifies the eliminated tank, named winner, results columns, exactly one persisted loss, both rematch buttons, restored health, a different first AI launch on a new map, and identical first-shot commitment on the same map even after advancing the frozen date. A unit scenario validates the fixture's bound and empty shot memory after reconstructing the same seed.
- **Synchronization:** browser helpers wait for exact turn labels, enabled controls, committed AI launch states, results, or canvas containment. Launch data is captured atomically with its turn and flight state. Aim holds wait for angle changes. Pause and local-turn time invariants advance the browser clock. There are no `waitForTimeout` calls or increased test timeouts.

The game engine, AI configuration, physics, damage model, and balance are unchanged. Package metadata now agrees with the existing 2.2 UI version.

## Release checks

Build and browser verification use the same repository base path as GitHub Pages:

```sh
npm test
npm run typecheck
VITE_BASE_PATH=/tiny-tanks/ npm run build
for run in 1 2 3; do
  CI=1 VITE_BASE_PATH=/tiny-tanks/ npm run test:browser || exit 1
done
```

Each browser run starts a fresh preview server and uses isolated browser contexts, one worker, and no retries. GitHub Actions independently repeats unit tests, typecheck, production build, and the complete browser suite before deploying Pages.

The first pushed revision passed three consecutive local suites but failed CI because the two completion tests consumed the 60-second test budget after already reaching results and restarting. Failure traces placed the rematch case at the record-button click after the replay exchange and the same-map case at replay turn 2. The fixture now uses minimum-power self hits and the existing reduced-motion preference. Replay coverage ends at the committed AI launch; full AI shot resolution remains covered separately. No timeout was increased and no winner, health, results, record, or commitment assertion was removed. Final verification results are recorded below after rerunning all release checks.

Verified locally on November 15, 2026, after the CI fixture correction:

| Check | Result |
| --- | --- |
| Unit tests (including the unchanged 216-scenario-per-skill accuracy guard) | 70/70 passed |
| Typecheck | Passed |
| Production build at `/tiny-tanks/` | Passed, including PWA generation |
| Final complete Playwright run 1 | 8/8 passed, 1.8 minutes |
| Final complete Playwright run 2 | 8/8 passed, 1.8 minutes |
| Final complete Playwright run 3 | 8/8 passed, 1.9 minutes |

The three final browser runs were consecutive on unchanged test code, with no retries. They include the advanced-date rematch distinction and the shorter real-physics completion fixture. The browser test file additionally passed an explicit strict TypeScript check (the repository's standard typecheck covers `src`, scripts, and build configuration).
