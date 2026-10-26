import { hashString } from "@iwakura/engine";

export type WeatherSetting = "auto" | "off" | "rain" | "snow" | "fog" | "storm";
export type WeatherKind = "clear" | "overcast" | "rain" | "storm" | "snow" | "fog" | "leaves" | "dust";

/**
 * Purely visual weather selection. It derives from clock and map, never from
 * the engine's gameplay RNG, so it cannot change a save's rules outcome.
 */
export function resolveWeatherKind(
  setting: WeatherSetting,
  mapId: string,
  hour: number,
  seed: string,
  indoor: boolean,
): WeatherKind {
  if (indoor) return setting === "off" ? "clear" : "dust";
  if (setting === "off") return "clear";
  if (setting !== "auto") return setting;
  const block = Math.floor(hour / 3);
  const roll = hashString(`${seed}:weather:${mapId}:${block}`) % 100;
  if (hour < 6) return roll < 52 ? "fog" : "clear";
  if (hour < 9) return roll < 30 ? "fog" : roll < 54 ? "overcast" : "clear";
  if (hour < 17)
    return roll < 5 ? "storm" : roll < 16 ? "rain" : roll < 28 ? "overcast" : roll < 36 ? "leaves" : "clear";
  if (hour < 21) return roll < 30 ? "overcast" : roll < 50 ? "fog" : "clear";
  return roll < 34 ? "fog" : "clear";
}
