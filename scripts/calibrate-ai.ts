import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { chooseShot } from "../src/game/ai";
import { chooseShot as baseline } from "../src/calibration/baseline-ai";
import { learningStudy, measure, tournament } from "../src/calibration/harness";
const isBaseline = process.argv.includes("--baseline");
const samples = Number(process.env.AI_SAMPLES ?? 432),
  games = Number(process.env.AI_GAMES ?? 90);
const planner = isBaseline ? baseline : chooseShot;
const report = {
  version: isBaseline ? "2.0 baseline (69cd138)" : "2.1 Fair & Fun",
  samplesPerDifficulty: samples,
  scenarios: measure(planner, samples),
  tournament: tournament(planner, games),
  learning: isBaseline ? null : learningStudy(planner, samples),
};
if (!isBaseline && samples >= 216) {
  const { easy, normal, hard } = report.scenarios;
  assert(
    easy.directRate < normal.directRate && normal.directRate < hard.directRate,
    "Skill levels must remain distinct",
  );
  assert(
    normal.directRate > 0.1 && normal.directRate < 0.34,
    "Normal must be dangerous and fallible",
  );
  assert(hard.directRate < 0.6, "Hard must remain fallible");
  assert(easy.directRate < 0.25, "Easy must remain approachable");
  assert(report.tournament.unresolved === 0, "Sample matches must resolve");
}
writeFileSync(
  process.env.AI_REPORT ??
    `/tmp/tiny-tanks-ai-${isBaseline ? "baseline" : "current"}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
