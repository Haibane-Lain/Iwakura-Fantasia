import { describe, expect, it } from "vitest";
import { resolveWeatherKind } from "./weather-rules";

describe("weather selection", () => {
  it("is deterministic for the same world, map, and time block", () => {
    const first = resolveWeatherKind("auto", "core:redford_village", 8, "seed-a", false);
    const second = resolveWeatherKind("auto", "core:redford_village", 8, "seed-a", false);
    expect(second).toBe(first);
  });

  it("lets explicit weather override the time of day", () => {
    expect(resolveWeatherKind("snow", "map", 12, "seed", false)).toBe("snow");
    expect(resolveWeatherKind("rain", "map", 12, "seed", false)).toBe("rain");
    expect(resolveWeatherKind("fog", "map", 12, "seed", false)).toBe("fog");
    expect(resolveWeatherKind("off", "map", 12, "seed", false)).toBe("clear");
  });

  it("keeps indoor scenes out of outdoor precipitation", () => {
    expect(resolveWeatherKind("auto", "crypt", 12, "seed", true)).toBe("dust");
    expect(resolveWeatherKind("storm", "crypt", 12, "seed", true)).toBe("dust");
    expect(resolveWeatherKind("off", "crypt", 12, "seed", true)).toBe("clear");
  });

  it("returns a known kind for every hour", () => {
    const kinds = new Set(["clear", "overcast", "rain", "storm", "snow", "fog", "leaves", "dust"]);
    for (let hour = 0; hour < 24; hour += 1) {
      expect(kinds.has(resolveWeatherKind("auto", "map", hour, "seed", false))).toBe(true);
    }
  });
});
