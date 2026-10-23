import type { GameState } from "@iwakura/contracts";
import { createRng, Rng } from "./rng.js";

/** Restore the campaign RNG from a save, fast-forwarding legacy cursors. */
export function rngFromGameState(state: GameState): Rng {
  const snapshot = state.rng;
  if (snapshot.state !== undefined) {
    return Rng.fromSnapshot({ seed: snapshot.seed, state: snapshot.state, cursor: snapshot.cursor });
  }
  const rng = createRng(snapshot.seed);
  for (let i = 0; i < snapshot.cursor; i += 1) rng.nextUint32();
  return rng;
}
