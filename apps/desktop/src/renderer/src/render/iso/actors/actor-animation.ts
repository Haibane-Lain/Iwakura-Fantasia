import type { ActorPose, ActorPresentation } from "./actor-types";

export type ActorActionKind = "attack" | "cast" | "guard" | "hurt" | "victory";

export interface ActorActionState {
  kind: ActorActionKind;
  durationMS: number;
  remainingMS: number;
}

export const WALK_SPEED_THRESHOLD = 6;
export const RUN_SPEED_THRESHOLD = 235;

export function actionDuration(kind: ActorActionKind): number {
  switch (kind) {
    case "hurt":
      return 260;
    case "guard":
      return 420;
    case "attack":
      return 470;
    case "cast":
      return 680;
    case "victory":
      return 1250;
  }
}

export function poseForState(options: {
  presentation: ActorPresentation;
  action: ActorActionState | null;
  speed: number;
}): ActorPose {
  if (options.presentation.defeated) return "down";
  if (options.action) return options.action.kind;
  if (options.presentation.talking) return "talk";
  if (options.speed >= RUN_SPEED_THRESHOLD) return "run";
  if (options.speed >= WALK_SPEED_THRESHOLD) return "walk";
  if (options.presentation.aggro) return "alert";
  return "idle";
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : Math.min(value, 1);
}

export function easeOutCubic(value: number): number {
  const t = 1 - clamp01(value);
  return 1 - t * t * t;
}

export function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * clamp01(value)) - 1) / 2;
}

export function pulse(value: number, phase = 0): number {
  return (Math.sin(value + phase) + 1) / 2;
}
