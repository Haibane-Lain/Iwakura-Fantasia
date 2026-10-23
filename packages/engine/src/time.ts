import type { Clock } from "@iwakura/contracts";

/** Advance a campaign clock by a number of minutes, rolling days forward. */
export function advanceClock(clock: Clock, minutes: number): Clock {
  const total = clock.hour * 60 + clock.minute + Math.max(0, Math.round(minutes));
  const dayOffset = Math.floor(total / 1440);
  const remainder = ((total % 1440) + 1440) % 1440;
  return {
    day: clock.day + dayOffset,
    hour: Math.floor(remainder / 60),
    minute: remainder % 60,
  };
}

export function formatClock(clock: Clock): string {
  const hh = String(clock.hour).padStart(2, "0");
  const mm = String(clock.minute).padStart(2, "0");
  return `Day ${clock.day} · ${hh}:${mm}`;
}

export function timeOfDay(clock: Clock): "night" | "dawn" | "morning" | "afternoon" | "dusk" {
  if (clock.hour < 5) return "night";
  if (clock.hour < 8) return "dawn";
  if (clock.hour < 12) return "morning";
  if (clock.hour < 18) return "afternoon";
  if (clock.hour < 21) return "dusk";
  return "night";
}
