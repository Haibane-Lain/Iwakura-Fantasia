export type KeySource = "keystore" | "environment" | "none";

export interface Keystore {
  get(): string | null;
  set(key: string): void;
  clear(): void;
  source(): KeySource;
}

/** Development / standalone fallback. Never persists the key. */
export function createEnvironmentKeystore(env: NodeJS.ProcessEnv = process.env): Keystore {
  let memory = env.OPENCODE_API_KEY?.trim() || null;
  return {
    get: () => memory,
    set: (key) => {
      memory = key.trim();
    },
    clear: () => {
      memory = null;
    },
    source: () => (memory ? "environment" : "none"),
  };
}
