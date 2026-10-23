import type { GameState } from "@iwakura/contracts";
import { describe, expect, it } from "vitest";
import {
  acceptQuest,
  advanceTime,
  applyDialogueAction,
  buyItem,
  claimQuest,
  createNpcEntities,
  dialogueRootForNpc,
  ensureShop,
  enterLocalMap,
  interactLocal,
  leaveLocalMap,
  localIsWalkable,
  localPath,
  moveLocalParty,
  npcsInLocalMap,
  restAtInn,
  sellItem,
  shopItemPrice,
  shopStock,
  startDialogue,
} from "./local.js";
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

function redfordState(): GameState {
  return makeState();
}

function atCrypt(state: GameState): GameState {
  const poi = state.world.pois.find((entry) => entry.id === "core:old_mill_crypt")!;
  const player = state.entities.player;
  return {
    ...state,
    party: { ...state.party, position: poi.hex },
    entities: player
      ? {
          ...state.entities,
          player: { ...player, hex: poi.hex },
        }
      : state.entities,
  };
}

describe("local maps and NPCs", () => {
  it("creates persistent NPC entities", () => {
    const entities = createNpcEntities();
    expect(entities["core:hessa"]?.name).toBe("Hessa Vale");
    expect(Object.keys(entities).length).toBeGreaterThan(5);
    const state = makeState();
    expect(state.entities["core:bryn"]).toBeDefined();
  });

  it("enters Redford and shows scheduled NPCs", () => {
    const entered = enterLocalMap(redfordState(), "core:redford");
    expect(entered).not.toBeNull();
    const state = entered!.state;
    expect(state.local?.map.id).toBe("core:redford_town");
    expect(state.local?.map.kind).toBe("town");
    expect(localIsWalkable(state.local!.map, state.local!.position)).toBe(true);
    const present = npcsInLocalMap(state).map((entry) => entry.npc.id);
    expect(present).toContain("core:hessa");
    expect(present).toContain("core:bryn");
    expect(present).toContain("core:maud");
    expect(state.entities.player?.localMapId).toBe("core:redford_town");
  });

  it("moves inside the town and changes the clock", () => {
    const state = enterLocalMap(redfordState(), "core:redford")!.state;
    const market = state.local!.map.spots.market!;
    const route = localPath(state.local!.map, state.local!.position, market);
    expect(route).not.toBeNull();
    const moved = moveLocalParty(state, market);
    expect(moved).not.toBeNull();
    expect(moved!.state.local?.position).toEqual(market);
    expect(moved!.state.clock.minute).toBeGreaterThan(0);
  });

  it("uses schedules at night", () => {
    const entered = enterLocalMap(redfordState(), "core:redford")!.state;
    const night = { ...entered, clock: { ...entered.clock, hour: 23 } };
    const present = npcsInLocalMap(night);
    expect(present.map((entry) => entry.npc.id)).toContain("core:hessa");
    expect(present.find((entry) => entry.npc.id === "core:bryn")?.schedule.activity).toBe(
      "shuttered for the night",
    );
  });

  it("falls back to a generic settlement for procedural town POIs", () => {
    const base = redfordState();
    const world = {
      ...base.world,
      pois: base.world.pois.map((poi) =>
        poi.id === "core:redford" ? { ...poi, id: "core:test_procedural_town", name: "Testford" } : poi,
      ),
    };
    const entered = enterLocalMap({ ...base, world }, "core:test_procedural_town");
    expect(entered).not.toBeNull();
    expect(entered!.map.id).toBe("core:generic_settlement");
    expect(entered!.map.name).toBe("Testford");
    expect(npcsInLocalMap(entered!.state).some((entry) => entry.npc.id === "core:sable")).toBe(true);
  });

  it("falls back to a generic dungeon layout for procedural dungeon POIs", () => {
    const base = redfordState();
    const world = {
      ...base.world,
      pois: base.world.pois.map((poi) =>
        poi.id === "core:old_mill_crypt"
          ? { ...poi, id: "core:test_procedural_dungeon", name: "Deep Hole" }
          : poi,
      ),
    };
    const entered = enterLocalMap({ ...base, world }, "core:test_procedural_dungeon");
    expect(entered).not.toBeNull();
    expect(entered!.map.id).toBe("core:generic_dungeon");
    expect(entered!.map.kind).toBe("dungeon");
    expect(entered!.map.exits.length).toBeGreaterThan(0);
  });
});

describe("dialogues, quests, and trade", () => {
  it("starts Hessa's quest through the authored dialogue", () => {
    let state = enterLocalMap(redfordState(), "core:redford")!.state;
    expect(dialogueRootForNpc(state, "core:hessa")).toBe("offer");
    const dialogue = startDialogue(state, "core:hessa");
    expect(dialogue?.nodeId).toBe("offer");
    const accepted = applyDialogueAction(state, "core:hessa", {
      type: "accept_quest",
      questId: "core:the_stopped_mill",
    });
    state = accepted.state;
    expect(state.quests["core:the_stopped_mill"]?.status).toBe("active");
    expect(accepted.message).toContain("Quest accepted");
    expect(state.world.pois.find((poi) => poi.id === "core:old_mill_crypt")?.discovered).toBe(true);
    expect(dialogueRootForNpc(state, "core:hessa")).toBe("active");
  });

  it("advances time and restores at the inn", () => {
    let state = enterLocalMap(redfordState(), "core:redford")!.state;
    const before = state.clock;
    state = advanceTime(state, 10 * 60);
    expect(state.clock.hour).not.toBe(before.hour);
    const inn = state.local!.map.buildings.find((building) => building.kind === "inn")!;
    const player = state.entities.player!;
    state = {
      ...state,
      entities: { ...state.entities, player: { ...player, hp: { ...player.hp, current: 1 } } },
    };
    const rested = restAtInn(state, inn.id);
    expect(rested).not.toBeNull();
    expect(rested!.state.entities.player?.hp.current).toBe(rested!.state.entities.player?.hp.max);
    expect(rested!.state.party.gold).toBe(state.party.gold - 1);
  });

  it("tracks reach and interaction objectives in the crypt", () => {
    let state = enterLocalMap(redfordState(), "core:redford")!.state;
    state = acceptQuest(state, "core:the_stopped_mill", "core:hessa").state;
    state = atCrypt(state);
    state = enterLocalMap(state, "core:old_mill_crypt")!.state;
    expect(state.local?.map.kind).toBe("dungeon");
    expect(state.quests["core:the_stopped_mill"]?.objectives[0]?.complete).toBe(true);

    const ledger = state.local!.map.interactables.find((entry) => entry.id === "core:crypt_ledger")!;
    const moved = moveLocalParty(state, ledger.hex);
    expect(moved).not.toBeNull();
    expect(moved!.encounter?.id).toBe("core:crypt_shades");
    const interacted = interactLocal(moved!.state, "core:crypt_ledger");
    expect(interacted).not.toBeNull();
    expect(interacted!.state.quests["core:the_stopped_mill"]?.objectives[1]?.complete).toBe(true);
    expect(
      interacted!.state.entities.player?.inventory.some((entry) => entry.itemId === "core:mills_ledger"),
    ).toBe(true);
    expect(dialogueRootForNpc(interacted!.state, "core:hessa")).toBe("ready");

    const beforeGold = interacted!.state.party.gold;
    const claimed = claimQuest(interacted!.state, "core:the_stopped_mill");
    expect(claimed.state.quests["core:the_stopped_mill"]?.status).toBe("completed");
    expect(claimed.state.party.gold).toBe(beforeGold + 40);
    expect(
      claimed.state.entities.player?.inventory.some((entry) => entry.itemId === "core:silver_locket"),
    ).toBe(true);
  });

  it("leaves a local map without losing the world position", () => {
    const entered = enterLocalMap(redfordState(), "core:redford")!.state;
    const left = leaveLocalMap(entered);
    expect(left.local).toBeUndefined();
    expect(left.entities.player?.localMapId).toBeUndefined();
    expect(left.party.position).toEqual(entered.local?.returnWorldPosition);
  });

  it("buys and sells from the market", () => {
    let state = enterLocalMap(redfordState(), "core:redford")!.state;
    state = ensureShop(state, "core:redford_market");
    expect(shopStock(state, "core:redford_market")["core:torch"]).toBe(8);
    expect(shopItemPrice("core:redford_market", "core:torch", "buy")).toBe(1);
    const beforeGold = state.party.gold;
    const bought = buyItem(state, "core:redford_market", "core:torch");
    expect(bought.ok).toBe(true);
    state = bought.state;
    expect(state.party.gold).toBe(beforeGold - 1);
    expect(shopStock(state, "core:redford_market")["core:torch"]).toBe(7);
    expect(state.entities.player?.inventory.some((entry) => entry.itemId === "core:torch")).toBe(true);

    const sold = sellItem(state, "core:redford_market", "core:torch");
    expect(sold.ok).toBe(true);
    expect(sold.state.party.gold).toBe(beforeGold);
    expect(shopStock(sold.state, "core:redford_market")["core:torch"]).toBe(8);
  });
});
