import { describe, expect, it } from "vitest";
import { parseNpcTurn } from "./index.js";

export const FORBIDDEN_INTENT_CASES = [
  {
    name: "item quantity outside engine bounds",
    payload: {
      speech: "Take this.",
      intents: [{ type: "give_item", itemId: "core:longsword", quantity: 99 }],
    },
  },
  {
    name: "unknown intent type",
    payload: {
      speech: "The road is closed.",
      intents: [{ type: "summon_dragon" }],
    },
  },
  {
    name: "disposition delta outside bounds",
    payload: {
      speech: "I will remember this.",
      intents: [{ type: "adjust_disposition", axis: "trust", delta: 100, reason: "too much" }],
    },
  },
  {
    name: "missing memory text",
    payload: {
      speech: "Noted.",
      memoryWrites: [{ importance: 0.5 }],
    },
  },
];

describe("npc eval fixtures", () => {
  for (const fixture of FORBIDDEN_INTENT_CASES) {
    it(`rejects or drops ${fixture.name}`, () => {
      const result = parseNpcTurn(JSON.stringify(fixture.payload));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.intents).toHaveLength(0);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.value.speech.length).toBeGreaterThan(0);
      }
    });
  }
});
