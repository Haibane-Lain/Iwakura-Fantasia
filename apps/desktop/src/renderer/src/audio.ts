let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(frequency: number, duration: number, volume: number, type: OscillatorType): void {
  if (volume <= 0) return;
  const audio = ensureContext();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(40, frequency * 0.55),
    audio.currentTime + duration,
  );
  gain.gain.setValueAtTime(Math.min(0.08, volume * 0.08), audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
}

export function playClick(masterVolume: number, sfxVolume: number): void {
  tone(520, 0.045, masterVolume * sfxVolume, "triangle");
}

export function playImpact(masterVolume: number, sfxVolume: number): void {
  tone(120, 0.16, masterVolume * sfxVolume, "sawtooth");
}

export function playReward(masterVolume: number, sfxVolume: number): void {
  tone(660, 0.12, masterVolume * sfxVolume, "sine");
  window.setTimeout(() => tone(880, 0.18, masterVolume * sfxVolume, "sine"), 90);
}

export function applyAppearance(options: {
  uiScale: number;
  reduceMotion: boolean;
  highContrast: boolean;
}): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--ui-scale", String(options.uiScale));
  document.documentElement.classList.toggle("reduce-motion", options.reduceMotion);
  document.documentElement.classList.toggle("high-contrast", options.highContrast);
}
