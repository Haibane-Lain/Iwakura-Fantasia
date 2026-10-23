import type { NpcPersona } from "@iwakura/contracts";
import { NpcTurnSchema } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import { buildNpcPrompt, estimateTokens, parseStructured, stripCodeFence } from "./index.js";

const persona: NpcPersona = {
  id: "npc:mara",
  name: "Mara Vell",
  pronouns: "she/her",
  role: "Innkeeper of the Salt Lantern",
  summary: "Warm to paying guests, dryly amused by trouble, careful with secrets.",
  voice: "Low, practical, a little wry. Favours short sentences.",
  goals: ["Keep the inn solvent", "Protect her nephew"],
  fears: ["Fire", "The miller's debt coming due"],
  secrets: ["She hides a ledger in the cellar"],
  knowledge: ["The miller's family vanished three days ago", "The north road is watched"],
  sampleLines: ["Sit. You look like bad news and worse weather."],
  archetype: "merchant",
  recruitable: false,
};

describe("npc prompt", () => {
  it("is deterministic and places stable sections before dynamic ones", () => {
    const input = {
      worldName: "Iwakura",
      regionName: "Redford",
      timeOfDay: "evening",
      persona,
      relationship: { trust: 10, affection: 0, respect: 5, fear: 0 },
      scene: "The common room is half empty. Rain against the shutters.",
      memories: ["The player paid for two nights up front."],
      transcript: [{ role: "player" as const, text: "What happened at the mill?" }],
      playerUtterance: "What happened at the mill?",
      contentRating: "teen" as const,
    };
    const first = buildNpcPrompt(input);
    const second = buildNpcPrompt(input);
    expect(first).toEqual(second);
    expect(first.system.indexOf("RULES")).toBeLessThan(first.system.indexOf("CHARACTER"));
    expect(first.user.indexOf("RELATIONSHIP")).toBeLessThan(first.user.indexOf("PLAYER SAYS"));
    expect(first.system).toContain("Mara Vell");
    expect(first.user).toContain("The player paid for two nights up front.");
  });
});

describe("structured parsing", () => {
  it("strips markdown fences", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });

  it("parses a valid NPC turn", () => {
    const result = parseStructured(
      NpcTurnSchema,
      JSON.stringify({
        speech: "The mill? Ask me again after a drink.",
        emotion: "wary",
        intents: [
          {
            type: "adjust_disposition",
            axis: "trust",
            delta: -3,
            reason: "The player pried too quickly.",
          },
        ],
        memoryWrites: [{ text: "The player asked about the mill.", importance: 0.6 }],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.emotion).toBe("wary");
      expect(result.value.intents[0]?.type).toBe("adjust_disposition");
    }
  });

  it("rejects out-of-band intents", () => {
    const result = parseStructured(
      NpcTurnSchema,
      JSON.stringify({
        speech: "Take this.",
        intents: [{ type: "give_item", itemId: "core:longsword", quantity: 99 }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("reports invalid JSON", () => {
    const result = parseStructured(NpcTurnSchema, "not json");
    expect(result.ok).toBe(false);
  });
});

describe("token estimate", () => {
  it("is proportional to text length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
