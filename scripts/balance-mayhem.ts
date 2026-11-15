import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chooseShot, fireAIShot } from "../src/game/ai";
import { chooseSupplyMove } from "../src/game/ai-movement";
import { DEFAULT_SETTINGS, PROFILE_IDS, WORLD } from "../src/game/config";
import { Match } from "../src/game/match";

function sample(enabled: boolean) {
  let games = 0,
    unresolved = 0,
    turns = 0,
    pickups = 0,
    repairs = 0,
    supplies = 0,
    gusts = 0,
    tremors = 0,
    oneShots = 0;
  const profiles: Record<
    string,
    { games: number; turns: number; unresolved: number }
  > = {};
  for (const profile of PROFILE_IDS) {
    profiles[profile] = { games: 0, turns: 0, unresolved: 0 };
    for (const theme of ["green", "desert", "moon"] as const)
      for (const seed of [284, 912]) {
        const g = new Match(
          {
            ...DEFAULT_SETTINGS,
            players: 3,
            profile,
            theme,
            supplies: enabled,
            environmentalEvents: enabled,
          },
          seed,
        );
        const capture = () => {
          for (const event of g.events) {
            if (event.type === "supply" && event.action === "drop") supplies++;
            if (event.type === "supply" && event.action === "pickup") {
              pickups++;
              repairs += Number(event.drop.kind === "repair");
            }
            if (event.type === "environment" && event.action === "gust")
              gusts++;
            if (event.type === "environment" && event.action === "tremor")
              tremors++;
          }
          g.events.length = 0;
        };
        for (let turn = 0; turn < 120 && g.phase !== "over"; turn++) {
          for (let i = 0; i < 96; i++) {
            g.tick();
            capture();
          }
          assert.equal(g.phase, "aim");
          const movement = chooseSupplyMove(g);
          if (movement)
            for (let step = 0; step < 90; step++) {
              const supply = g.supplies.find((d) => d.id === movement.supplyId);
              if (
                supply?.state !== "landed" ||
                !g.move(movement.direction, 1 / 60)
              )
                break;
              g.tick(1 / 60);
              capture();
            }
          const health = g.tanks.map((t) => t.health);
          assert(fireAIShot(g, chooseShot(g)));
          let ticks = 0;
          while (g.phase !== "aim" && g.phase !== "over" && ticks++ < 2600) {
            g.tick();
            capture();
          }
          assert(
            ticks < 2600,
            "Every shot/event must settle within the simulation bound",
          );
          for (let i = 0; i < g.tanks.length; i++) {
            oneShots += Number(
              health[i] === g.settings.health && g.tanks[i].health === 0,
            );
            assert(
              health[i] - g.tanks[i].health <=
                Math.max(12, health[i] * WORLD.maxAttackDamageRatio) + 0.001,
              "Attack damage must respect the 2.2 per-target budget",
            );
          }
        }
        games++;
        turns += g.turn;
        unresolved += Number(g.phase !== "over");
        profiles[profile].games++;
        profiles[profile].turns += g.turn;
        profiles[profile].unresolved += Number(g.phase !== "over");
      }
  }
  return {
    games,
    unresolved,
    meanTurns: turns / games,
    pickups,
    repairs,
    supplies,
    gusts,
    tremors,
    oneShots,
    profiles: Object.fromEntries(
      Object.entries(profiles).map(([name, p]) => [
        name,
        {
          games: p.games,
          meanTurns: p.turns / p.games,
          unresolved: p.unresolved,
        },
      ]),
    ),
  };
}
const report = {
  version: "2.3.0",
  methodology:
    "Paired Normal-AI simulated matches, 4 profiles × 3 themes × 2 seeds; 3 tanks; 120-shot bound. Actual shared movement, supply, event, and projectile paths. Not a human-play or device-performance benchmark.",
  baseline: sample(false),
  mayhem: sample(true),
};
assert.equal(report.mayhem.unresolved, 0, "Representative matches must finish");
assert.equal(
  report.mayhem.oneShots,
  0,
  "No full-health single-attack eliminations",
);
assert(
  report.mayhem.meanTurns <= report.baseline.meanTurns * 1.35,
  "New systems must not substantially prolong the sample",
);
writeFileSync(
  process.env.MAYHEM_REPORT ?? "/tmp/tiny-tanks-mayhem-balance.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
