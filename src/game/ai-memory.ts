import { clamp } from "./config";
import { AI_RULES, uncertainty, type AISkill } from "./ai-config";
import type { Match, Tank } from "./match";
import type { WeaponId } from "./weapons";
export function sampleTerrain(
  match: Match,
  fromX: number,
  toX: number,
): number[] {
  return Array.from({ length: AI_RULES.terrainSamples }, (_, i) =>
    match.terrain.at(
      fromX + ((toX - fromX) * i) / (AI_RULES.terrainSamples - 1),
    ),
  );
}
export interface MemoryGuidance {
  angle: number;
  power: number;
  correction: number;
  confidence: number;
  miss: number;
}
export function shotMemory(
  match: Match,
  target: Tank,
  weapon: WeaponId,
  estimatedWind: number,
  skill: AISkill,
  rng: () => number,
): MemoryGuidance | undefined {
  if (match.current.health <= 0 || target.health <= 0) return;
  const previous = [...match.shotHistory]
    .reverse()
    .find(
      (s) =>
        s.owner === match.current.id &&
        s.intent?.target === target.id &&
        s.weapon === weapon,
    );
  if (!previous?.intent || !previous.impacts.length) return;
  const intent = previous.intent;
  if (
    Math.abs(previous.originY - match.current.y) >
      AI_RULES.memoryPositionThreshold ||
    Math.abs(intent.targetY - target.y) > AI_RULES.memoryPositionThreshold ||
    Math.abs(intent.targetX - target.x) > AI_RULES.memoryPositionThreshold
  )
    return;
  const samples = sampleTerrain(match, match.current.x, target.x);
  const change =
    samples.reduce(
      (sum, h, i) => sum + Math.abs(h - intent.terrainSamples[i]),
      0,
    ) / samples.length;
  if (!Number.isFinite(change) || change > AI_RULES.memoryTerrainThreshold)
    return;
  const impact = previous.impacts.reduce((a, b) =>
    Math.hypot(a.x - intent.targetX, a.y - intent.targetY) <
    Math.hypot(b.x - intent.targetX, b.y - intent.targetY)
      ? a
      : b,
  );
  const direction = Math.sign(target.x - match.current.x);
  const miss = (impact.x - intent.targetX) * direction;
  const weather = Math.max(
    0.1,
    1 -
      Math.abs(estimatedWind - intent.estimatedWind) /
        AI_RULES.windChangeThreshold,
  );
  const confidence =
    skill.memoryAccuracy *
    (1 - change / AI_RULES.memoryTerrainThreshold) *
    weather;
  const correction = clamp(
    ((-miss * previous.power) /
      (2 * Math.max(120, Math.abs(target.x - match.current.x)))) *
      skill.learningRate *
      confidence,
    -skill.maxPowerCorrection,
    skill.maxPowerCorrection,
  );
  return {
    angle: clamp(
      previous.angle + uncertainty(rng) * (1 - skill.memoryAccuracy) * 2,
      0,
      180,
    ),
    power: clamp(
      previous.power +
        correction +
        uncertainty(rng) * (1 - skill.memoryAccuracy) * 3,
      0,
      100,
    ),
    correction,
    confidence,
    miss,
  };
}
