import type { Difficulty } from "./config";
import type { WeaponId } from "./weapons";
export interface AISkill {
  aimErrorDegrees: number;
  powerErrorPercent: number;
  windEstimationError: number;
  targetPositionError: number;
  trajectorySearchBudget: number;
  targetSelectionSkill: number;
  weaponSelectionSkill: number;
  memoryAccuracy: number;
  learningRate: number;
  maxPowerCorrection: number;
  riskTolerance: number;
  crateAwareness: number;
  decisionDelay: number;
  description: string;
  weaponWeights: Record<WeaponId, number>;
}
export const AI_SKILLS: Readonly<Record<Difficulty, AISkill>> = {
  easy: {
    aimErrorDegrees: 5.5,
    powerErrorPercent: 9.5,
    windEstimationError: 8,
    targetPositionError: 18,
    trajectorySearchBudget: 60,
    targetSelectionSkill: 0.2,
    weaponSelectionSkill: 0.2,
    memoryAccuracy: 0.3,
    learningRate: 0.2,
    maxPowerCorrection: 3,
    riskTolerance: 0.38,
    crateAwareness: 0.1,
    decisionDelay: 0.72,
    description: "Relaxed opponents that make frequent mistakes.",
    weaponWeights: {
      standard: 0.83,
      heavy: 0.07,
      triple: 0.04,
      cluster: 0.03,
      bunker: 0.02,
      mega: 0.01,
    },
  },
  normal: {
    aimErrorDegrees: 3,
    powerErrorPercent: 5,
    windEstimationError: 3.5,
    targetPositionError: 10,
    trajectorySearchBudget: 140,
    targetSelectionSkill: 0.65,
    weaponSelectionSkill: 0.6,
    memoryAccuracy: 0.62,
    learningRate: 0.45,
    maxPowerCorrection: 5,
    riskTolerance: 0.22,
    crateAwareness: 0.55,
    decisionDelay: 0.66,
    description: "Balanced opponents with realistic accuracy.",
    weaponWeights: {
      standard: 0.43,
      heavy: 0.19,
      triple: 0.15,
      cluster: 0.1,
      bunker: 0.09,
      mega: 0.04,
    },
  },
  hard: {
    aimErrorDegrees: 1.3,
    powerErrorPercent: 2.2,
    windEstimationError: 1.2,
    targetPositionError: 4,
    trajectorySearchBudget: 260,
    targetSelectionSkill: 0.9,
    weaponSelectionSkill: 0.9,
    memoryAccuracy: 0.86,
    learningRate: 0.65,
    maxPowerCorrection: 7,
    riskTolerance: 0.13,
    crateAwareness: 0.95,
    decisionDelay: 0.6,
    description: "Skilled opponents that learn and adapt.",
    weaponWeights: {
      standard: 0.32,
      heavy: 0.24,
      triple: 0.15,
      cluster: 0.1,
      bunker: 0.13,
      mega: 0.06,
    },
  },
};
export const AI_RULES = {
  memoryTerrainThreshold: 18,
  memoryPositionThreshold: 24,
  windChangeThreshold: 22,
  terrainSamples: 7,
  preparationDelay: 0.12,
  turretSpeed: 180,
  powerSpeed: 180,
  settledAimTolerance: 0.8,
  aimPause: 0.1,
} as const;
/** Bounded triangular noise: small errors are common; large errors are possible. */
export const uncertainty = (rng: () => number): number => rng() + rng() - 1;

/** Standard normal variation, bounded at 2.5 sigma; skill errors are standard deviations. */
export const normalNoise = (rng: () => number): number =>
  Math.max(
    -2.5,
    Math.min(
      2.5,
      Math.sqrt(-2 * Math.log(Math.max(1e-9, rng()))) *
        Math.cos(2 * Math.PI * rng()),
    ),
  );
