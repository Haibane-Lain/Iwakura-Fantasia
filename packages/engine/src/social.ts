import { FACTIONS, getFaction, getNpcDefinition, getQuestTemplate } from "@iwakura/content";
import type { GameState, NpcDefinition, QuestState } from "@iwakura/contracts";

function stamp(state: GameState): GameState["campaign"] {
  return { ...state.campaign, updatedAt: new Date().toISOString() };
}

export function initialFactions(): GameState["factions"] {
  return Object.fromEntries(
    FACTIONS.map((faction) => [faction.id, { id: faction.id, name: faction.name, reputation: 0 }]),
  );
}

export function addRumor(state: GameState, text: string, sourceId?: string): GameState {
  if (state.rumors.some((rumor) => rumor.text === text)) return state;
  return {
    ...state,
    rumors: [
      ...state.rumors,
      {
        id: `rumor:${state.rumors.length + 1}:${text.slice(0, 24)}`,
        text,
        ...(sourceId ? { sourceId } : {}),
        createdAt: new Date().toISOString(),
        read: false,
      },
    ].slice(-60),
    campaign: stamp(state),
  };
}

export function adjustFaction(
  state: GameState,
  factionId: string,
  delta: number,
  _reason: string,
): GameState {
  const definition = getFaction(factionId);
  if (!definition) return state;
  const current = state.factions[factionId] ?? {
    id: factionId,
    name: definition.name,
    reputation: 0,
  };
  const reputation = Math.max(-100, Math.min(100, current.reputation + delta));
  return {
    ...state,
    factions: {
      ...state.factions,
      [factionId]: { ...current, reputation },
    },
    campaign: stamp(state),
  };
}

export function companionApproval(state: GameState, npcId: string): number {
  const relationship = state.relationships[npcId];
  return (relationship?.trust ?? 0) + (relationship?.affection ?? 0);
}

export function isCompanion(state: GameState, npcId: string): boolean {
  return state.entities[npcId]?.companion === true && state.party.memberIds.includes(npcId);
}

export function recruitCompanion(state: GameState, npcId: string): { state: GameState; message: string } {
  const npc = getNpcDefinition(npcId);
  const entity = state.entities[npcId];
  if (!npc || !entity) return { state, message: "They are not here." };
  if (!npc.persona.recruitable) return { state, message: `${npc.name} will not leave their post.` };
  if (isCompanion(state, npcId)) return { state, message: `${npc.name} already travels with you.` };
  const relationship = state.relationships[npcId] ?? {
    trust: 0,
    affection: 0,
    respect: 0,
    fear: 0,
  };
  let next: GameState = {
    ...state,
    party: { ...state.party, memberIds: [...new Set([...state.party.memberIds, npcId])] },
    entities: {
      ...state.entities,
      [npcId]: {
        ...entity,
        companion: true,
        recruitable: false,
        tags: [...new Set([...entity.tags, "companion"])],
      },
    },
    relationships: {
      ...state.relationships,
      [npcId]: { ...relationship, trust: Math.min(100, relationship.trust + 8) },
    },
    campaign: stamp(state),
  };
  next = addRumor(next, `${npc.name} has joined the party.`, npcId);
  next = recordCompanionBanter(next, npcId, "The road is quieter with company. Or it will be.");
  return { state: next, message: `${npc.name} joins the party.` };
}

export function dismissCompanion(state: GameState, npcId: string): { state: GameState; message: string } {
  const npc = getNpcDefinition(npcId);
  const entity = state.entities[npcId];
  if (!npc || !entity || !isCompanion(state, npcId)) {
    return { state, message: "They are not travelling with you." };
  }
  const next: GameState = {
    ...state,
    party: { ...state.party, memberIds: state.party.memberIds.filter((id) => id !== npcId) },
    entities: {
      ...state.entities,
      [npcId]: {
        ...entity,
        companion: false,
        recruitable: true,
        tags: entity.tags.filter((tag) => tag !== "companion"),
      },
    },
    campaign: stamp(state),
  };
  return {
    state: addRumor(next, `${npc.name} has left the party.`, npcId),
    message: `${npc.name} leaves the party.`,
  };
}

export function recordCompanionBanter(state: GameState, npcId: string, text: string): GameState {
  const key = `companion.banter.${npcId}`;
  const current = Array.isArray(state.flags[key])
    ? state.flags[key].filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    ...state,
    flags: {
      ...state.flags,
      [key]: [...current, text].slice(-8),
    },
  };
}

export function companionBanter(state: GameState, npcId: string): string[] {
  const value = state.flags[`companion.banter.${npcId}`];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function romanceGate(state: GameState, npcId: string): { state: GameState; message: string } {
  const npc = getNpcDefinition(npcId);
  const relationship = state.relationships[npcId] ?? {
    trust: 0,
    affection: 0,
    respect: 0,
    fear: 0,
  };
  if (!npc) return { state, message: "They are not here." };
  if (relationship.affection < 20) {
    return {
      state,
      message: `${npc.name} needs more time before that kind of closeness.`,
    };
  }
  const rating = state.campaign.settings.contentRating;
  const next: GameState = {
    ...state,
    flags: { ...state.flags, [`romance.${npcId}`]: { rating, at: new Date().toISOString() } },
    campaign: stamp(state),
  };
  return {
    state: addRumor(next, `You and ${npc.name} share a quiet night at camp.`, npcId),
    message:
      rating === "teen"
        ? `You and ${npc.name} share a quiet night at camp. The chronicle fades to black.`
        : `You and ${npc.name} share a quiet night at camp.`,
  };
}

export function branchQuest(
  state: GameState,
  questId: string,
  branchId: string,
): { state: GameState; message: string } {
  const quest = state.quests[questId];
  const template = getQuestTemplate(quest?.templateId ?? "");
  if (!quest || !template) return { state, message: "That task cannot branch now." };
  if (quest.status !== "active") return { state, message: "That task is already resolved." };
  let next: GameState = {
    ...state,
    quests: {
      ...state.quests,
      [questId]: {
        ...quest,
        stageId: `branch:${branchId}`,
        flags: { ...quest.flags, branchId },
      },
    },
    campaign: stamp(state),
  };
  if (branchId === "watchman_alive") {
    next = adjustFaction(next, "core:redford_watch", 10, "The watchman was recovered alive.");
    next = addRumor(next, "The Greywatch watchman was recovered alive. The Watch is grateful.", "core:maud");
  } else if (branchId === "watchman_dead") {
    next = adjustFaction(next, "core:redford_watch", -5, "The watchman was lost at Greywatch.");
    next = addRumor(next, "The Greywatch watchman is dead. The southeast road is closed.", "core:maud");
  } else {
    next = addRumor(next, `A choice was made: ${branchId}.`, template.turnInNpcId);
  }
  return { state: next, message: "The chronicle remembers this choice." };
}

export function questRecap(state: GameState): string {
  const lines: string[] = [];
  const active = Object.values(state.quests).filter((quest) => quest.status === "active");
  const completed = Object.values(state.quests).filter((quest) => quest.status === "completed");
  if (active.length > 0) lines.push(`Open threads: ${active.map((quest) => quest.title).join("; ")}.`);
  if (completed.length > 0)
    lines.push(`Closed threads: ${completed.map((quest) => quest.title).join("; ")}.`);
  const branches = completed
    .map((quest) => quest.flags.branchId)
    .filter((branch): branch is string => typeof branch === "string");
  if (branches.length > 0) lines.push(`Choices remembered: ${branches.join(", ")}.`);
  const companions = state.party.memberIds
    .filter((id) => id !== "player")
    .map((id) => state.entities[id]?.name)
    .filter((name): name is string => Boolean(name));
  if (companions.length > 0) lines.push(`Travelling with you: ${companions.join(", ")}.`);
  const factions = Object.values(state.factions).filter((faction) => faction.reputation !== 0);
  if (factions.length > 0) {
    lines.push(
      `Standing: ${factions.map((faction) => `${faction.name} ${faction.reputation > 0 ? "+" : ""}${faction.reputation}`).join("; ")}.`,
    );
  }
  if (state.rumors.length > 0)
    lines.push(
      `Rumors: ${state.rumors
        .slice(-3)
        .map((rumor) => rumor.text)
        .join(" ")}`,
    );
  return lines.join(" ") || "The chronicle has not yet found its first thread.";
}

export function npcIsRecruitable(npc: NpcDefinition): boolean {
  return npc.persona.recruitable;
}

export function questBranch(state: GameState, questId: string): string | undefined {
  const branch = state.quests[questId]?.flags.branchId;
  return typeof branch === "string" ? branch : undefined;
}

export function activeQuestCount(state: GameState): number {
  return Object.values(state.quests).filter((quest) => quest.status === "active").length;
}

export function completedQuestCount(state: GameState): number {
  return Object.values(state.quests).filter((quest) => quest.status === "completed").length;
}

export function firstActiveQuest(state: GameState): QuestState | undefined {
  return Object.values(state.quests).find((quest) => quest.status === "active");
}
