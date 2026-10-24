import { getItem, getNpcDefinition, getQuestTemplate } from "@iwakura/content";
import type { GameState, NpcIntent, NpcTurn } from "@iwakura/contracts";
import { startBattle } from "./battle.js";
import { addItemToInventory } from "./character.js";
import { adjustRelationship, claimQuest, ensureShop, removeItemFromInventory } from "./local.js";

export interface NpcTurnResult {
  state: GameState;
  events: string[];
  rejected: string[];
  shopId?: string;
  battleStarted?: boolean;
}

function memoryKey(npcId: string): string {
  return `npc.memories.${npcId}`;
}

export function npcMemories(state: GameState, npcId: string): string[] {
  const value = state.flags[memoryKey(npcId)];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
}

/** Lexical memory retrieval for prompt context. */
export function retrieveNpcMemories(state: GameState, npcId: string, query: string, limit = 5): string[] {
  const memories = npcMemories(state, npcId);
  const terms = words(query);
  if (terms.length === 0) return memories.slice(-limit);
  return memories
    .map((memory) => {
      const lower = memory.toLowerCase();
      const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0), 0);
      return { memory, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.memory);
}

export function recordConversationSummary(state: GameState, npcId: string, summary: string): GameState {
  const key = `npc.summaries.${npcId}`;
  const current = Array.isArray(state.flags[key])
    ? state.flags[key].filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    ...state,
    flags: {
      ...state.flags,
      [key]: [...current, summary].slice(-8),
    },
  };
}

export function npcConversationSummaries(state: GameState, npcId: string): string[] {
  const value = state.flags[`npc.summaries.${npcId}`];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function remember(state: GameState, npcId: string, text: string): GameState {
  const existing = npcMemories(state, npcId);
  if (existing.includes(text)) return state;
  return {
    ...state,
    flags: {
      ...state.flags,
      [memoryKey(npcId)]: [...existing, text].slice(-20),
    },
  };
}

function questReady(quest: GameState["quests"][string]): boolean {
  return quest.objectives.length > 0 && quest.objectives.every((objective) => objective.complete);
}

function reject(rejected: string[], message: string): void {
  rejected.push(message);
}

export function applyNpcTurn(state: GameState, npcId: string, turn: NpcTurn): NpcTurnResult {
  const npc = getNpcDefinition(npcId);
  if (!npc) {
    return { state, events: [], rejected: [`Unknown NPC: ${npcId}`] };
  }
  let next = state;
  const events: string[] = [];
  const rejected: string[] = [];
  let shopId: string | undefined;
  let battleStarted = false;

  for (const intent of turn.intents) {
    switch (intent.type) {
      case "adjust_disposition": {
        next = adjustRelationship(next, npcId, {
          axis: intent.axis,
          delta: intent.delta,
          reason: intent.reason,
        });
        events.push(`${npc.name}'s ${intent.axis} changes by ${intent.delta > 0 ? "+" : ""}${intent.delta}.`);
        break;
      }
      case "remember": {
        next = remember(next, npcId, intent.fact);
        events.push(`${npc.name} will remember that.`);
        break;
      }
      case "offer_quest": {
        const template = getQuestTemplate(intent.templateId);
        if (!template || template.giverNpcId !== npcId) {
          reject(rejected, `Quest ${intent.templateId} is not ${npc.name}'s to offer.`);
          break;
        }
        if (
          next.quests[template.id]?.status === "active" ||
          next.quests[template.id]?.status === "completed"
        ) {
          reject(rejected, `Quest ${template.id} is already known.`);
          break;
        }
        next = {
          ...next,
          flags: { ...next.flags, [`npc.offered.${npcId}.${template.id}`]: intent.hook },
        };
        events.push(`${npc.name} offers: ${template.title}.`);
        break;
      }
      case "complete_quest": {
        const quest = next.quests[intent.questId];
        const template = getQuestTemplate(intent.questId);
        if (!quest || !template || template.turnInNpcId !== npcId) {
          reject(rejected, `${npc.name} cannot complete that task.`);
          break;
        }
        if (!questReady(quest)) {
          reject(rejected, "The quest objectives are not complete.");
          break;
        }
        const result = claimQuest(next, intent.questId);
        next = result.state;
        events.push(result.message);
        break;
      }
      case "open_trade": {
        if (!npc.shopId) {
          reject(rejected, `${npc.name} has nothing to sell.`);
          break;
        }
        next = ensureShop(next, npc.shopId);
        shopId = npc.shopId;
        events.push(`${npc.name} opens the stall.`);
        break;
      }
      case "give_item": {
        const item = getItem(intent.itemId);
        if (!item) {
          reject(rejected, `Unknown item: ${intent.itemId}.`);
          break;
        }
        const player = next.entities.player;
        if (!player) {
          reject(rejected, "No player character.");
          break;
        }
        next = {
          ...next,
          entities: {
            ...next.entities,
            player: {
              ...player,
              inventory: addItemToInventory(player.inventory, item.id, intent.quantity),
            },
          },
        };
        events.push(`${npc.name} gives you ${item.name} ×${intent.quantity}.`);
        break;
      }
      case "demand_item": {
        const item = getItem(intent.itemId);
        const player = next.entities.player;
        if (!item || !player?.inventory.some((entry) => entry.itemId === item.id)) {
          reject(rejected, `You do not carry ${intent.itemId}.`);
          break;
        }
        next = {
          ...next,
          entities: {
            ...next.entities,
            player: {
              ...player,
              inventory: removeItemFromInventory(player.inventory, item.id, intent.quantity),
            },
          },
        };
        events.push(`${npc.name} takes ${item.name} ×${intent.quantity}.`);
        break;
      }
      case "start_combat": {
        if (next.battle) {
          reject(rejected, "A battle is already underway.");
          break;
        }
        const started = startBattle(next, {
          enemyIds: ["core:bandit", "core:wolf"],
          source: "scripted",
        });
        if (!started) {
          reject(rejected, "Combat cannot start here.");
          break;
        }
        next = started;
        battleStarted = true;
        events.push(`${npc.name} reaches for steel.`);
        break;
      }
      case "mark_location": {
        const poi = next.world.pois.find((entry) => entry.id === intent.locationId);
        if (!poi) {
          reject(rejected, `Unknown location: ${intent.locationId}.`);
          break;
        }
        next = {
          ...next,
          world: {
            ...next.world,
            pois: next.world.pois.map((entry) =>
              entry.id === poi.id ? { ...entry, discovered: true } : entry,
            ),
          },
        };
        events.push(`${poi.name} is marked on your map.`);
        break;
      }
      case "set_meeting": {
        next = {
          ...next,
          flags: {
            ...next.flags,
            [`npc.meeting.${npcId}`]: { inHours: intent.inHours, locationId: intent.locationId },
          },
        };
        events.push(`${npc.name} agrees to meet you later.`);
        break;
      }
      case "offer_recruitment":
      case "dismiss_companion":
      case "flee":
      case "surrender":
      case "call_for_help": {
        reject(rejected, `${intent.type} is deferred until the companion system.`);
        break;
      }
      default:
        reject(rejected, `Unsupported intent: ${(intent as NpcIntent).type}.`);
    }
  }

  for (const memory of turn.memoryWrites) {
    next = remember(next, npcId, memory.text);
  }
  return {
    state: next,
    events,
    rejected,
    ...(shopId ? { shopId } : {}),
    ...(battleStarted ? { battleStarted: true } : {}),
  };
}
