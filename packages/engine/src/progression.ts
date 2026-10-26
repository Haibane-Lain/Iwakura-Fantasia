import { getClass, getFeat, getSubclass, getTalentTree } from "@iwakura/content";
import type { AttributeKey, Entity, GameState, TalentNode } from "@iwakura/contracts";
import {
  availableTalentNodes,
  featureAbilities,
  getTalentNodeForEntity,
  recomputeEntity,
} from "./character.js";

export const MAX_LEVEL = 10;
export const FEAT_LEVELS = [4, 8, 10] as const;

function updated(state: GameState): GameState["campaign"] {
  return { ...state.campaign, updatedAt: new Date().toISOString() };
}

function withPlayer(state: GameState, player: Entity): GameState {
  return {
    ...state,
    entities: { ...state.entities, player },
    campaign: updated(state),
  };
}

export function awardMilestone(state: GameState, amount = 1, reason = "A milestone was reached."): GameState {
  const player = state.entities.player;
  if (!player) return state;
  const level = player.level;
  const pending = player.progression.pendingLevelUps;
  const room = Math.max(0, MAX_LEVEL - level - pending);
  if (room === 0) return state;
  const gain = Math.min(Math.max(1, amount), room);
  const next: Entity = {
    ...player,
    progression: {
      ...player.progression,
      milestones: player.progression.milestones + gain,
      pendingLevelUps: pending + gain,
      notes: [...player.progression.notes.slice(-19), reason],
    },
  };
  return withPlayer(state, next);
}

export function milestoneProgress(entity: Entity): {
  level: number;
  pending: number;
  nextLevel: number | null;
  needsSubclass: boolean;
  needsFeat: boolean;
  talentPoints: number;
} {
  const characterClass = entity.classId ? getClass(entity.classId) : undefined;
  const nextLevel = entity.level < MAX_LEVEL ? entity.level + 1 : null;
  const needsSubclass = Boolean(
    characterClass && nextLevel === characterClass.subclassLevel && !entity.progression.subclassId,
  );
  const needsFeat = nextLevel !== null && FEAT_LEVELS.includes(nextLevel as (typeof FEAT_LEVELS)[number]);
  return {
    level: entity.level,
    pending: entity.progression.pendingLevelUps,
    nextLevel,
    needsSubclass,
    needsFeat,
    talentPoints: entity.progression.talentPoints,
  };
}

export interface LevelUpChoice {
  subclassId?: string;
  featId?: string;
  asiAttribute?: AttributeKey;
}

export function applyLevelUp(state: GameState, choice: LevelUpChoice = {}): GameState | null {
  const player = state.entities.player;
  if (!player || player.progression.pendingLevelUps <= 0 || player.level >= MAX_LEVEL) return null;
  const characterClass = player.classId ? getClass(player.classId) : undefined;
  if (!characterClass) return null;
  const nextLevel = player.level + 1;

  let subclassId = player.progression.subclassId;
  if (nextLevel === characterClass.subclassLevel) {
    const candidate = choice.subclassId ? getSubclass(choice.subclassId) : undefined;
    if (!candidate || candidate.classId !== characterClass.id) return null;
    subclassId = candidate.id;
  }

  const featIds = [...player.progression.featIds];
  const asiChoices = { ...player.progression.asiChoices };
  const attributes = { ...player.attributes };
  if (FEAT_LEVELS.includes(nextLevel as (typeof FEAT_LEVELS)[number])) {
    if (choice.featId) {
      const feat = getFeat(choice.featId);
      if (!feat || featIds.includes(feat.id) || feat.level > nextLevel) return null;
      featIds.push(feat.id);
    } else {
      const attribute = choice.asiAttribute ?? characterClass.primaryAttributes[0]!;
      attributes[attribute] = Math.min(30, attributes[attribute] + 2);
      asiChoices[attribute] = (asiChoices[attribute] ?? 0) + 2;
    }
  }

  const oldHpMax = player.hp.max;
  const oldFocusMax = player.focus.max;
  const leveled: Entity = {
    ...player,
    level: nextLevel,
    attributes,
    progression: {
      ...player.progression,
      pendingLevelUps: player.progression.pendingLevelUps - 1,
      subclassId,
      featIds,
      asiChoices,
      talentPoints: player.progression.talentPoints + 1,
      notes: [
        ...player.progression.notes.slice(-19),
        nextLevel === characterClass.subclassLevel && !player.progression.subclassId
          ? `Chose the ${getSubclass(subclassId!)?.name ?? "new"} path at level ${nextLevel}.`
          : `Reached level ${nextLevel}.`,
      ],
    },
  };
  const next = recomputeEntity(leveled);
  const gainedHp = Math.max(0, next.hp.max - oldHpMax);
  const gainedFocus = Math.max(0, next.focus.max - oldFocusMax);
  return withPlayer(state, {
    ...next,
    hp: { ...next.hp, current: Math.min(next.hp.max, next.hp.current + gainedHp) },
    focus: { ...next.focus, current: Math.min(next.focus.max, next.focus.current + gainedFocus) },
  });
}

export function canSpendTalentPoint(entity: Entity, node: TalentNode): boolean {
  return (
    entity.progression.talentPoints >= node.cost &&
    !entity.progression.spentTalentNodeIds.includes(node.id) &&
    node.level <= entity.level &&
    node.prerequisites.every((id) => entity.progression.spentTalentNodeIds.includes(id))
  );
}

export function spendTalentPoint(state: GameState, nodeId: string): GameState | null {
  const player = state.entities.player;
  if (!player) return null;
  const node = getTalentNodeForEntity(player, nodeId);
  if (!node || !canSpendTalentPoint(player, node)) return null;
  const next = recomputeEntity({
    ...player,
    progression: {
      ...player.progression,
      talentPoints: player.progression.talentPoints - node.cost,
      spentTalentNodeIds: [...player.progression.spentTalentNodeIds, node.id],
      notes: [...player.progression.notes.slice(-19), `Learned ${node.name}.`],
    },
  });
  return withPlayer(state, next);
}

export function refundTalentPoints(state: GameState, costGold = 0): GameState | null {
  const player = state.entities.player;
  if (!player) return null;
  if (costGold > 0 && state.party.gold < costGold) return null;
  const characterClass = player.classId ? getClass(player.classId) : undefined;
  const tree =
    (player.progression.talentTreeId ? getTalentTree(player.progression.talentTreeId) : undefined) ??
    (characterClass?.talentTreeId ? getTalentTree(characterClass.talentTreeId) : undefined);
  if (!tree) return null;
  const refunded = player.progression.spentTalentNodeIds.reduce(
    (sum, id) => sum + (tree.nodes.find((node) => node.id === id)?.cost ?? 0),
    0,
  );
  const next = recomputeEntity({
    ...player,
    progression: {
      ...player.progression,
      talentPoints: player.progression.talentPoints + refunded,
      spentTalentNodeIds: [],
      notes: [...player.progression.notes.slice(-19), "Reflected on a different discipline."],
    },
  });
  return {
    ...state,
    party: costGold > 0 ? { ...state.party, gold: state.party.gold - costGold } : state.party,
    entities: { ...state.entities, player: next },
    campaign: updated(state),
  };
}

export function availableNodesForPlayer(state: GameState): TalentNode[] {
  return state.entities.player ? availableTalentNodes(state.entities.player) : [];
}

export function knownAbilitiesForPlayer(state: GameState): string[] {
  return state.entities.player ? featureAbilities(state.entities.player) : [];
}

/**
 * Rebuilds derived character values after loading a save. Older saves gain
 * defaulted progression fields, missing talent points, and derived skill/tool
 * metadata without changing their authored choices.
 */
export function normalizeGameState(state: GameState): GameState {
  let changed = false;
  const entities = { ...state.entities };
  for (const [id, entity] of Object.entries(entities)) {
    if (entity.kind !== "player" && !entity.classId) continue;
    const next = recomputeEntity(entity);
    entities[id] = next;
    changed = true;
  }
  return changed ? { ...state, entities } : state;
}
