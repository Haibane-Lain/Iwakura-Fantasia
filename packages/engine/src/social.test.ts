import type { DirectorTurn, GameState } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import { applyDirectorTurn, generateQuestFromTemplate } from "./director.js";
import { acceptQuest, claimQuest, enterLocalMap, progressQuests } from "./local.js";
import {
  branchQuest,
  companionApproval,
  dismissCompanion,
  isCompanion,
  questRecap,
  recruitCompanion,
  romanceGate,
} from "./social.js";
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

describe("companions, factions, and directors", () => {
  it("recruits and dismisses a companion", () => {
    let state = enterLocalMap(makeState(), "core:redford")!.state;
    const recruited = recruitCompanion(state, "core:wren");
    state = recruited.state;
    expect(isCompanion(state, "core:wren")).toBe(true);
    expect(state.party.memberIds).toContain("core:wren");
    expect(companionApproval(state, "core:wren")).toBeGreaterThan(0);
    const dismissed = dismissCompanion(state, "core:wren");
    expect(isCompanion(dismissed.state, "core:wren")).toBe(false);
  });

  it("gates romance behind affection and content settings", () => {
    let state = makeState();
    const denied = romanceGate(state, "core:wren");
    expect(denied.state.flags["romance.core:wren"]).toBeUndefined();
    state = {
      ...state,
      relationships: {
        ...state.relationships,
        "core:wren": { trust: 10, affection: 25, respect: 5, fear: 0 },
      },
    };
    const allowed = romanceGate(state, "core:wren");
    expect(allowed.state.flags["romance.core:wren"]).toBeDefined();
    expect(allowed.message).toContain("fades to black");
  });

  it("branches a completed quest and applies faction/world reactions", () => {
    let state = enterLocalMap(makeState(), "core:redford")!.state;
    state = acceptQuest(state, "core:greywatch_watch", "core:maud").state;
    state = progressQuests(state, { kind: "reach", targetId: "core:greywatch_ruin" });
    const branch = branchQuest(state, "core:greywatch_watch", "watchman_alive");
    state = branch.state;
    expect(state.quests["core:greywatch_watch"]?.flags.branchId).toBe("watchman_alive");
    expect(state.factions["core:redford_watch"]?.reputation).toBe(10);
    expect(state.rumors.some((rumor) => rumor.text.includes("alive"))).toBe(true);
    const claimed = claimQuest(state, "core:greywatch_watch");
    expect(claimed.state.quests["core:greywatch_watch"]?.status).toBe("completed");
    expect(questRecap(claimed.state)).toContain("watchman_alive");
  });

  it("generates and claims a work quest from a template", () => {
    const state = enterLocalMap(makeState(), "core:redford")!.state;
    const generated = generateQuestFromTemplate(state, "core:road_unquiet", "core:maud");
    expect(generated.questId).toBeTruthy();
    const quest = generated.state.quests[generated.questId!]!;
    expect(quest.objectives[0]?.targetId).toBeTruthy();
    const targetId = quest.objectives[0]!.targetId!;
    const progressed = progressQuests(generated.state, { kind: "reach", targetId });
    const claimed = claimQuest(progressed, quest.id);
    expect(claimed.state.quests[quest.id]?.status).toBe("completed");
    expect(claimed.state.party.gold).toBe(progressed.party.gold + 25);
    expect(claimed.state.factions["core:redford_watch"]?.reputation).toBe(5);
  });

  it("validates director operations", () => {
    const state = enterLocalMap(makeState(), "core:redford")!.state;
    const turn: DirectorTurn = {
      beat: "A rumor reaches the market.",
      mood: "tense",
      operations: [
        {
          type: "create_quest_from_template",
          templateId: "core:missing_tally",
          giverId: "core:maud",
          title: "A Tally Mislaid",
          hook: "The millers need a favor.",
        },
        {
          type: "reveal_rumor",
          text: "The southeast road is watched.",
          locationId: "core:greywatch_ruin",
        },
        {
          type: "change_faction_relation",
          factionId: "core:millers_compact",
          delta: 4,
          reason: "A rumor was carried.",
        },
        {
          type: "advance_quest_stage",
          questId: "core:not_real",
          stageId: "nope",
          reason: "test",
        },
      ],
    };
    const result = applyDirectorTurn(state, turn);
    expect(result.events.length).toBeGreaterThanOrEqual(3);
    expect(result.rejected).toHaveLength(1);
    expect(result.state.rumors.some((rumor) => rumor.text.includes("southeast"))).toBe(true);
    expect(result.state.factions["core:millers_compact"]?.reputation).toBe(4);
  });
});
