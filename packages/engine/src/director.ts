import { getNpcDefinition, getQuestWorkTemplate } from "@iwakura/content";
import type { DirectorTurn, GameState, QuestObjective } from "@iwakura/contracts";
import { addRumor, adjustFaction, branchQuest } from "./social.js";
import { rngFromGameState } from "./state-rng.js";
import { advanceClock } from "./time.js";

function stamp(state: GameState): GameState["campaign"] {
  return { ...state.campaign, updatedAt: new Date().toISOString() };
}

export interface WorkQuestResult {
  state: GameState;
  message: string;
  questId?: string;
}

export function generateQuestFromTemplate(
  state: GameState,
  templateId: string,
  giverId = "core:maud",
): WorkQuestResult {
  const template = getQuestWorkTemplate(templateId);
  const giver = getNpcDefinition(giverId);
  if (!template) return { state, message: "That work is not available." };
  if (!giver) return { state, message: "No one is offering that work." };
  const candidates = state.world.pois.filter((poi) => template.targetKinds.includes(poi.kind));
  if (candidates.length === 0) return { state, message: "No suitable destination is known." };
  const rng = rngFromGameState(state);
  const target = candidates[rng.int(0, candidates.length)]!;
  const questId = `quest:${template.id}:${target.id}`;
  if (state.quests[questId]?.status === "active" || state.quests[questId]?.status === "completed") {
    return { state, message: "That work is already on the board.", questId };
  }
  const objective: QuestObjective = {
    id: "reach_target",
    kind: template.objectiveKind,
    description: `Reach ${target.name}.`,
    targetId: target.id,
    required: 1,
    progress: 0,
    complete: false,
  };
  const summary = template.summary.replace("{place}", target.name);
  const snapshot = rng.snapshot();
  let next: GameState = {
    ...state,
    rng: { seed: snapshot.seed, state: snapshot.state, cursor: snapshot.cursor },
    quests: {
      ...state.quests,
      [questId]: {
        id: questId,
        templateId: template.id,
        title: template.title,
        summary,
        giverId,
        status: "active",
        stageId: "active",
        objectives: [objective],
        rewards: {
          gold: template.rewardGold,
          items: [],
          turnInNpcId: giverId,
        },
        flags: {
          workTemplateId: template.id,
          turnInNpcId: giverId,
          factionId: template.factionId,
          place: target.name,
        },
      },
    },
    world: {
      ...state.world,
      pois: state.world.pois.map((poi) => (poi.id === target.id ? { ...poi, discovered: true } : poi)),
    },
    campaign: stamp(state),
  };
  next = addRumor(next, `${giver.name} is offering work: ${template.title} at ${target.name}.`, giverId);
  return { state: next, message: `New work: ${template.title} at ${target.name}.`, questId };
}

export function applyDirectorTurn(
  state: GameState,
  turn: DirectorTurn,
): { state: GameState; events: string[]; rejected: string[] } {
  let next = state;
  const events: string[] = [];
  const rejected: string[] = [];
  for (const operation of turn.operations) {
    switch (operation.type) {
      case "create_quest_from_template": {
        const result = generateQuestFromTemplate(next, operation.templateId, operation.giverId);
        next = result.state;
        if (result.questId) events.push(result.message);
        else rejected.push(result.message);
        break;
      }
      case "advance_quest_stage": {
        const quest = next.quests[operation.questId];
        if (quest?.status !== "active") {
          rejected.push(`Quest ${operation.questId} is not active.`);
          break;
        }
        next = {
          ...next,
          quests: {
            ...next.quests,
            [quest.id]: { ...quest, stageId: operation.stageId },
          },
          campaign: stamp(next),
        };
        events.push(`${quest.title} advances to ${operation.stageId}.`);
        break;
      }
      case "add_objective": {
        const quest = next.quests[operation.questId];
        if (quest?.status !== "active") {
          rejected.push(`Quest ${operation.questId} is not active.`);
          break;
        }
        const objective: QuestObjective = {
          id: operation.objectiveId,
          kind: "interact",
          description: operation.description,
          ...(operation.targetId ? { targetId: operation.targetId } : {}),
          required: 1,
          progress: 0,
          complete: false,
        };
        next = {
          ...next,
          quests: {
            ...next.quests,
            [quest.id]: { ...quest, objectives: [...quest.objectives, objective] },
          },
          campaign: stamp(next),
        };
        events.push(`New objective added to ${quest.title}.`);
        break;
      }
      case "branch_quest": {
        const result = branchQuest(next, operation.questId, operation.branchId);
        next = result.state;
        events.push(result.message);
        break;
      }
      case "spawn_encounter": {
        next = {
          ...next,
          flags: {
            ...next.flags,
            [`director.encounter.${operation.templateId}`]: {
              hex: operation.hex,
              reason: operation.reason,
            },
          },
          campaign: stamp(next),
        };
        next = addRumor(next, `A new encounter is stirring: ${operation.reason || operation.templateId}.`);
        events.push("An encounter is scheduled.");
        break;
      }
      case "change_faction_relation": {
        next = adjustFaction(next, operation.factionId, operation.delta, operation.reason);
        events.push(`Faction ${operation.factionId} changes by ${operation.delta}.`);
        break;
      }
      case "reveal_rumor": {
        next = addRumor(next, operation.text, operation.locationId);
        events.push("A rumor spreads.");
        break;
      }
      case "advance_clock": {
        next = {
          ...next,
          clock: advanceClock(next.clock, operation.minutes),
          campaign: stamp(next),
        };
        events.push(`The clock advances ${operation.minutes} minutes.`);
        break;
      }
      case "schedule_world_event": {
        next = {
          ...next,
          flags: {
            ...next.flags,
            [`director.event.${operation.eventId}`]: { inDays: operation.inDays },
          },
          campaign: stamp(next),
        };
        events.push(`World event ${operation.eventId} scheduled.`);
        break;
      }
      default:
        rejected.push("Unsupported director operation.");
    }
  }
  return { state: next, events, rejected };
}
