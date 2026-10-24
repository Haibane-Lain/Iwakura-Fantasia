import type { GameState, NpcTurn } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import { applyNpcTurn, npcMemories } from "./ai.js";
import { acceptQuest, enterLocalMap, progressQuests } from "./local.js";
import { createGameState } from "./world.js";
import { generateWorld } from "./worldgen.js";

function makeState(): GameState {
  return createGameState({
    world: generateWorld({ source: "handcrafted", seed: "core:redford_reach" }).world,
    settings: {
      worldSource: "handcrafted",
      seed: "core:redford_reach",
      genParams: {
        width: 64,
        height: 64,
        seaLevel: 0.42,
        climate: "varied",
        magicLevel: "standard",
        danger: "normal",
        settlementDensity: 0.5,
      },
      difficulty: "normal",
      contentRating: "teen",
      aiEnabled: true,
    },
    campaignId: "test",
    campaignName: "Test",
  });
}

function turn(partial: Partial<NpcTurn>): NpcTurn {
  return {
    speech: "A line.",
    emotion: "neutral",
    intents: [],
    memoryWrites: [],
    ...partial,
  };
}

describe("npc intent validation", () => {
  it("applies disposition and memory writes", () => {
    const state = enterLocalMap(makeState(), "core:redford")!.state;
    const result = applyNpcTurn(
      state,
      "core:hessa",
      turn({
        intents: [
          {
            type: "adjust_disposition",
            axis: "trust",
            delta: 5,
            reason: "The player listened.",
          },
        ],
        memoryWrites: [{ text: "The player asked about the mill.", importance: 0.6 }],
      }),
    );
    expect(result.state.relationships["core:hessa"]?.trust).toBe(5);
    expect(npcMemories(result.state, "core:hessa")).toContain("The player asked about the mill.");
    expect(result.rejected).toHaveLength(0);
  });

  it("records a valid quest offer and rejects an invalid one", () => {
    const state = enterLocalMap(makeState(), "core:redford")!.state;
    const valid = applyNpcTurn(
      state,
      "core:hessa",
      turn({
        intents: [
          {
            type: "offer_quest",
            templateId: "core:the_stopped_mill",
            hook: "The miller needs help.",
          },
        ],
      }),
    );
    expect(valid.events.some((event) => event.includes("offers"))).toBe(true);
    expect(valid.state.flags["npc.offered.core:hessa.core:the_stopped_mill"]).toBe("The miller needs help.");
    const invalid = applyNpcTurn(
      state,
      "core:bryn",
      turn({
        intents: [
          {
            type: "offer_quest",
            templateId: "core:the_stopped_mill",
            hook: "Not mine to offer.",
          },
        ],
      }),
    );
    expect(invalid.rejected[0]).toContain("not");
  });

  it("completes a ready quest through the engine", () => {
    let state = enterLocalMap(makeState(), "core:redford")!.state;
    state = acceptQuest(state, "core:the_stopped_mill", "core:hessa").state;
    state = progressQuests(state, { kind: "reach", targetId: "core:old_mill_crypt" });
    state = progressQuests(state, { kind: "interact", targetId: "core:crypt_ledger" });
    const result = applyNpcTurn(
      state,
      "core:hessa",
      turn({
        intents: [{ type: "complete_quest", questId: "core:the_stopped_mill" }],
      }),
    );
    expect(result.state.quests["core:the_stopped_mill"]?.status).toBe("completed");
    expect(result.state.party.gold).toBe(state.party.gold + 40);
  });

  it("opens a shop and gives an item only when valid", () => {
    const state = enterLocalMap(makeState(), "core:redford")!.state;
    const shop = applyNpcTurn(state, "core:bryn", turn({ intents: [{ type: "open_trade" }] }));
    expect(shop.shopId).toBe("core:redford_market");
    expect(shop.state.shops["core:redford_market"]).toBeDefined();

    const gift = applyNpcTurn(
      state,
      "core:bryn",
      turn({ intents: [{ type: "give_item", itemId: "core:torch", quantity: 2 }] }),
    );
    expect(gift.state.entities.player?.inventory.some((entry) => entry.itemId === "core:torch")).toBe(true);
    const invalid = applyNpcTurn(
      state,
      "core:bryn",
      turn({ intents: [{ type: "give_item", itemId: "core:not_an_item", quantity: 1 }] }),
    );
    expect(invalid.rejected).toHaveLength(1);
  });

  it("rejects deferred companion intents", () => {
    const state = enterLocalMap(makeState(), "core:redford")!.state;
    const result = applyNpcTurn(
      state,
      "core:hessa",
      turn({
        intents: [{ type: "offer_recruitment", wage: 10, role: "companion" }],
      }),
    );
    expect(result.rejected[0]).toContain("deferred");
  });
});
