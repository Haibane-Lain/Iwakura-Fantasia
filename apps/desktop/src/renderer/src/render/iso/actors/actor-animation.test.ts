import { describe, expect, it } from "vitest";
import { actionDuration, clamp01, poseForState } from "./actor-animation";

describe("actor animation state", () => {
  it("prioritises defeat over every other state", () => {
    expect(
      poseForState({
        presentation: { defeated: true, talking: true },
        action: { kind: "attack", durationMS: 470, remainingMS: 300 },
        speed: 240,
      }),
    ).toBe("down");
  });

  it("plays one-shot actions before locomotion", () => {
    expect(
      poseForState({
        presentation: {},
        action: { kind: "attack", durationMS: 470, remainingMS: 300 },
        speed: 240,
      }),
    ).toBe("attack");
    expect(
      poseForState({
        presentation: {},
        action: { kind: "cast", durationMS: 680, remainingMS: 300 },
        speed: 0,
      }),
    ).toBe("cast");
  });

  it("separates idle, talk, alert, walk, and run", () => {
    const base = { presentation: {}, action: null };
    expect(poseForState({ ...base, presentation: {}, speed: 0 })).toBe("idle");
    expect(poseForState({ ...base, presentation: { talking: true }, speed: 0 })).toBe("talk");
    expect(poseForState({ ...base, presentation: { aggro: true }, speed: 0 })).toBe("alert");
    expect(poseForState({ ...base, presentation: {}, speed: 190 })).toBe("walk");
    expect(poseForState({ ...base, presentation: {}, speed: 310 })).toBe("run");
  });

  it("has deterministic one-shot durations and clamped helpers", () => {
    expect(actionDuration("hurt")).toBeLessThan(actionDuration("attack"));
    expect(actionDuration("attack")).toBeLessThan(actionDuration("cast"));
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
});
