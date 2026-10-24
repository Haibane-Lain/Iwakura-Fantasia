import {
  getAncestry,
  getDialogueDefinition,
  getItem,
  getLocalMapDefinition,
  getLocalMapForPoi,
  getLocalTile,
  getNpcDefinition,
  getQuestTemplate,
  getShopDefinition,
  localTileFromChar,
  NPCS,
  QUESTS,
} from "@iwakura/content";
import type {
  Attributes,
  CharacterAppearance,
  DialogueAction,
  DialogueDefinition,
  Entity,
  GameState,
  Hex,
  InventoryEntry,
  LocalBuilding,
  LocalEncounter,
  LocalInteractable,
  LocalMap,
  LocalMapDefinition,
  LocalPoint,
  LocalState,
  NpcDefinition,
  NpcScheduleEntry,
  QuestObjective,
  QuestState,
  ShopDefinition,
  ShopState,
} from "@iwakura/contracts";
import { addItemToInventory } from "./character.js";
import { axialIndex, offsetToAxial } from "./grid.js";
import { distance, findPath, hexKey } from "./hex.js";
import { adjustFaction, branchQuest, dismissCompanion, recruitCompanion, romanceGate } from "./social.js";
import { advanceClock } from "./time.js";

function pointToHex(point: LocalPoint): Hex {
  return offsetToAxial(point);
}

function hexAt(map: LocalMap, hex: Hex): string {
  const index = axialIndex(map.width, map.height, hex);
  return index >= 0 ? (map.tiles[index] ?? "grass") : "grass";
}

export function localTileAt(map: LocalMap, hex: Hex): string {
  return hexAt(map, hex);
}

export function localTileInfo(map: LocalMap, hex: Hex) {
  return getLocalTile(localTileAt(map, hex));
}

export function localIsWalkable(map: LocalMap, hex: Hex): boolean {
  return localTileInfo(map, hex).walkable;
}

export function localPath(map: LocalMap, from: Hex, to: Hex) {
  return findPath(from, to, (h) => (localIsWalkable(map, h) ? 1 : null));
}

export function localDistance(a: Hex, b: Hex): number {
  return distance(a, b);
}

function buildMapFromDefinition(def: LocalMapDefinition): LocalMap {
  const width = Math.max(...def.rows.map((row) => row.length));
  const height = def.rows.length;
  const tiles: string[] = [];
  for (const row of def.rows) {
    for (let col = 0; col < width; col += 1) tiles.push(localTileFromChar(row[col] ?? "."));
  }
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    description: def.description,
    width,
    height,
    tiles,
    entrance: pointToHex(def.entrance),
    buildings: def.buildings.map((building) => ({
      id: building.id,
      name: building.name,
      kind: building.kind,
      hex: pointToHex(building.door),
      description: building.description,
      ...(building.shopId ? { shopId: building.shopId } : {}),
    })),
    exits: def.exits.map((exit) => ({
      id: exit.id,
      name: exit.name,
      hex: pointToHex(exit.point),
      description: exit.description,
      target: exit.target,
    })),
    interactables: def.interactables.map((interactable) => ({
      id: interactable.id,
      name: interactable.name,
      kind: interactable.kind,
      hex: pointToHex(interactable.point),
      description: interactable.description,
      ...(interactable.itemId ? { itemId: interactable.itemId } : {}),
      oneShot: interactable.oneShot,
    })),
    encounters: def.encounters.map((encounter) => ({
      id: encounter.id,
      name: encounter.name,
      hex: pointToHex(encounter.point),
      radius: encounter.radius,
      description: encounter.description,
    })),
    spots: Object.fromEntries(Object.entries(def.spots).map(([name, point]) => [name, pointToHex(point)])),
  };
}

const GENERIC_TOWN_TEMPLATE = "core:generic_settlement";
const GENERIC_DUNGEON_TEMPLATE = "core:generic_dungeon";

function genericMap(poiId: string, name: string, kind: LocalMap["kind"], description: string): LocalMap {
  const templateId = kind === "dungeon" ? GENERIC_DUNGEON_TEMPLATE : GENERIC_TOWN_TEMPLATE;
  const template = getLocalMapDefinition(templateId);
  if (!template) throw new Error(`Missing local map template: ${templateId}`);
  return buildMapFromDefinition({
    ...template,
    name,
    kind,
    description,
    worldPoiId: poiId,
  });
}

export function buildLocalMap(state: GameState, poiId: string): LocalMap {
  const poi = state.world.pois.find((entry) => entry.id === poiId);
  if (!poi) throw new Error(`Unknown point of interest: ${poiId}`);
  const definition = getLocalMapForPoi(poi.id);
  if (definition) return buildMapFromDefinition(definition);
  return genericMap(
    poi.id,
    poi.name,
    poi.kind === "dungeon" ? "dungeon" : poi.kind === "village" ? "village" : "town",
    poi.description,
  );
}

function attributeSheet(ancestryId?: string): Attributes {
  const attributes: Attributes = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const ancestry = ancestryId ? getAncestry(ancestryId) : undefined;
  if (ancestry) {
    for (const [key, bonus] of Object.entries(ancestry.bonuses)) {
      attributes[key as keyof Attributes] += Number(bonus);
    }
  }
  return attributes;
}

export function createNpcEntity(npc: NpcDefinition): Entity {
  const attributes = attributeSheet(npc.ancestryId);
  return {
    id: npc.id,
    kind: "npc",
    name: npc.name,
    pronouns: npc.pronouns,
    description: npc.description,
    ...(npc.ancestryId ? { ancestryId: npc.ancestryId } : {}),
    level: 1,
    attributes,
    hp: { current: 8, max: 8 },
    ac: 10,
    speed: 6,
    focus: { current: 0, max: 0 },
    conditions: [],
    abilityIds: [],
    inventory: [],
    equipment: {},
    skillIds: [],
    appearance: {
      palette: npc.palette,
      sigil: npc.sigil,
      seed: npc.id,
    },
    recruitable: false,
    companion: false,
    tags: ["npc", npc.role],
  };
}

export function createNpcEntities(): Record<string, Entity> {
  return Object.fromEntries(NPCS.map((npc) => [npc.id, createNpcEntity(npc)]));
}

export function ensureNpcEntities(state: GameState): GameState {
  let changed = false;
  const entities = { ...state.entities };
  for (const npc of NPCS) {
    if (entities[npc.id]) continue;
    entities[npc.id] = createNpcEntity(npc);
    changed = true;
  }
  return changed ? { ...state, entities } : state;
}

function activeSchedule(npc: NpcDefinition, hour: number, mapId: string): NpcScheduleEntry | undefined {
  return npc.schedule.find((slot) => {
    if (slot.mapId !== mapId) return false;
    if (slot.fromHour < slot.toHour) return hour >= slot.fromHour && hour < slot.toHour;
    return hour >= slot.fromHour || hour < slot.toHour;
  });
}

export interface NpcPresence {
  npc: NpcDefinition;
  entity: Entity;
  schedule: NpcScheduleEntry;
  hex: Hex;
}

export function npcsInLocalMap(state: GameState): NpcPresence[] {
  const local = state.local;
  if (!local) return [];
  const result: NpcPresence[] = [];
  for (const npc of NPCS) {
    const schedule = activeSchedule(npc, state.clock.hour, local.map.id);
    if (!schedule) continue;
    const hex = local.map.spots[schedule.spot];
    if (!hex) continue;
    const entity = state.entities[npc.id];
    if (!entity) continue;
    result.push({ npc, entity, schedule, hex });
  }
  return result.sort((a, b) => a.npc.name.localeCompare(b.npc.name));
}

export function npcAtLocalHex(state: GameState, hex: Hex): NpcPresence | undefined {
  return npcsInLocalMap(state).find((entry) => entry.hex.q === hex.q && entry.hex.r === hex.r);
}

export function localBuildingAt(state: GameState, hex: Hex): LocalBuilding | undefined {
  return state.local?.map.buildings.find((building) => building.hex.q === hex.q && building.hex.r === hex.r);
}

export function localInteractableAt(state: GameState, hex: Hex): LocalInteractable | undefined {
  return state.local?.map.interactables.find(
    (interactable) => interactable.hex.q === hex.q && interactable.hex.r === hex.r,
  );
}

export function localExitAt(state: GameState, hex: Hex): LocalState["map"]["exits"][number] | undefined {
  return state.local?.map.exits.find((exit) => exit.hex.q === hex.q && exit.hex.r === hex.r);
}

export function localEncounterAt(state: GameState, hex: Hex): LocalEncounter | undefined {
  const local = state.local;
  if (!local) return undefined;
  return local.map.encounters.find(
    (encounter) => distance(encounter.hex, hex) <= encounter.radius && !local.encounterFlags[encounter.id],
  );
}

function updated(state: GameState): GameState["campaign"] {
  return { ...state.campaign, updatedAt: new Date().toISOString() };
}

export function advanceTime(state: GameState, minutes: number): GameState {
  return {
    ...state,
    clock: advanceClock(state.clock, minutes),
    campaign: updated(state),
  };
}

export interface EnterLocalResult {
  state: GameState;
  map: LocalMap;
}

export function enterLocalMap(state: GameState, poiId: string): EnterLocalResult | null {
  const poi = state.world.pois.find((entry) => entry.id === poiId);
  if (!poi || !["town", "village", "dungeon"].includes(poi.kind)) return null;
  const map = buildLocalMap(state, poiId);
  const base = ensureNpcEntities(state);
  const player = base.entities.player;
  const entities = player
    ? {
        ...base.entities,
        player: { ...player, hex: map.entrance, localMapId: map.id },
      }
    : base.entities;
  const local: LocalState = {
    map,
    position: map.entrance,
    returnWorldPosition: base.party.position,
    poiId,
    visitedInteractables: [],
    encounterFlags: {},
  };
  const entered: GameState = {
    ...base,
    local,
    entities,
    clock: advanceClock(base.clock, 5),
    campaign: updated(base),
  };
  return { state: progressQuests(entered, { kind: "reach", targetId: poiId }), map };
}

export function leaveLocalMap(state: GameState): GameState {
  if (!state.local) return state;
  const player = state.entities.player;
  const entities = player
    ? {
        ...state.entities,
        player: { ...player, hex: state.party.position, localMapId: undefined },
      }
    : state.entities;
  if (state.travel) {
    const position = state.travel.gateOutside ?? state.travel.map.entrance;
    return {
      ...state,
      local: undefined,
      travel: { ...state.travel, position, gateOutside: undefined },
      entities,
      clock: advanceClock(state.clock, 2),
      campaign: updated(state),
    };
  }
  return {
    ...state,
    local: undefined,
    entities,
    clock: advanceClock(state.clock, 5),
    campaign: updated(state),
  };
}

export interface LocalMoveResult {
  state: GameState;
  path: Hex[];
  minutes: number;
  encounter?: LocalEncounter;
}

export function moveLocalParty(state: GameState, to: Hex): LocalMoveResult | null {
  const local = state.local;
  if (!local) return null;
  if (local.position.q === to.q && local.position.r === to.r) return null;
  if (!localIsWalkable(local.map, to)) return null;
  const route = findPath(local.position, to, (h) => (localIsWalkable(local.map, h) ? 1 : null));
  if (!route) return null;
  let steps = route.path;
  let encounter: (typeof local.map.encounters)[number] | undefined;
  const encounterFlags = { ...local.encounterFlags };
  for (let index = 0; index < route.path.length; index += 1) {
    const step = route.path[index]!;
    const found = local.map.encounters.find(
      (entry) => !encounterFlags[entry.id] && distance(entry.hex, step) <= entry.radius,
    );
    if (!found) continue;
    encounter = found;
    encounterFlags[found.id] = true;
    steps = route.path.slice(0, index + 1);
    break;
  }
  const destination = steps[steps.length - 1] ?? to;
  const minutes = Math.max(1, steps.length * 2);
  const player = state.entities.player;
  const entities = player
    ? {
        ...state.entities,
        player: { ...player, hex: destination, localMapId: local.map.id },
      }
    : state.entities;
  return {
    state: {
      ...state,
      local: { ...local, position: destination, encounterFlags },
      entities,
      clock: advanceClock(state.clock, minutes),
      campaign: updated(state),
    },
    path: steps,
    minutes,
    ...(encounter ? { encounter } : {}),
  };
}

export interface LocalInteractResult {
  state: GameState;
  message: string;
  itemId?: string;
}

export function interactLocal(state: GameState, interactableId: string): LocalInteractResult | null {
  const local = state.local;
  if (!local) return null;
  const interactable = local.map.interactables.find((entry) => entry.id === interactableId);
  if (!interactable) return null;
  if (distance(local.position, interactable.hex) > 1) {
    return { state, message: "You need to stand closer." };
  }
  if (interactable.oneShot && local.visitedInteractables.includes(interactable.id)) {
    return { state, message: `${interactable.name} has already given up what it had.` };
  }
  const player = state.entities.player;
  let entities = state.entities;
  if (interactable.itemId && player) {
    entities = {
      ...state.entities,
      player: {
        ...player,
        inventory: addItemToInventory(player.inventory, interactable.itemId, 1),
      },
    };
  }
  const visited = [...local.visitedInteractables, interactable.id];
  let next: GameState = {
    ...state,
    entities,
    local: { ...local, visitedInteractables: visited },
    campaign: updated(state),
  };
  next = progressQuests(next, { kind: "interact", targetId: interactable.id });
  if (interactable.itemId) {
    next = progressQuests(next, { kind: "collect", targetId: interactable.itemId });
  }
  const itemName = interactable.itemId ? getItem(interactable.itemId)?.name : undefined;
  return {
    state: next,
    message: itemName
      ? `${interactable.name}: ${interactable.description} You take the ${itemName}.`
      : `${interactable.name}: ${interactable.description}`,
    ...(interactable.itemId ? { itemId: interactable.itemId } : {}),
  };
}

export function restAtInn(
  state: GameState,
  buildingId: string,
): { state: GameState; message: string } | null {
  const local = state.local;
  if (!local) return null;
  const building = local.map.buildings.find((entry) => entry.id === buildingId);
  if (building?.kind !== "inn") return null;
  if (state.party.gold < 1) return { state, message: "You cannot afford a room." };
  const player = state.entities.player;
  if (!player) return null;
  const entities = {
    ...state.entities,
    player: {
      ...player,
      hp: { ...player.hp, current: player.hp.max },
      focus: { ...player.focus, current: player.focus.max },
    },
  };
  return {
    state: {
      ...state,
      party: { ...state.party, gold: state.party.gold - 1 },
      entities,
      clock: advanceClock(state.clock, 8 * 60),
      campaign: updated(state),
    },
    message: "You sleep through the bell and wake with the room cold but your wounds closed.",
  };
}

export function ensureShop(state: GameState, shopId: string): GameState {
  const definition = getShopDefinition(shopId);
  if (!definition || state.shops[shopId]) return state;
  const stock: Record<string, number> = {};
  for (const entry of definition.stock) stock[entry.itemId] = (stock[entry.itemId] ?? 0) + entry.quantity;
  const shop: ShopState = { id: shopId, stock };
  return { ...state, shops: { ...state.shops, [shopId]: shop } };
}

export function shopDefinition(shopId: string): ShopDefinition | undefined {
  return getShopDefinition(shopId);
}

export function shopItemPrice(shopId: string, itemId: string, mode: "buy" | "sell"): number {
  const shop = getShopDefinition(shopId);
  const item = getItem(itemId);
  if (!shop || !item) return 0;
  const multiplier = mode === "buy" ? shop.buyMultiplier : shop.sellMultiplier;
  return mode === "buy"
    ? Math.ceil(item.valueGold * multiplier)
    : Math.max(1, Math.floor(item.valueGold * multiplier));
}

export function shopStock(state: GameState, shopId: string): Record<string, number> {
  return state.shops[shopId]?.stock ?? {};
}

export interface ShopResult {
  state: GameState;
  ok: boolean;
  message: string;
}

export function buyItem(state: GameState, shopId: string, itemId: string): ShopResult {
  let base = ensureShop(state, shopId);
  const shop = base.shops[shopId];
  const item = getItem(itemId);
  if (!shop || !item) return { state: base, ok: false, message: "That item is not for sale." };
  const available = shop.stock[itemId] ?? 0;
  if (available <= 0) return { state: base, ok: false, message: `There are no ${item.name}s left.` };
  const price = shopItemPrice(shopId, itemId, "buy");
  if (base.party.gold < price) return { state: base, ok: false, message: `You need ${price} gp.` };
  const player = base.entities.player;
  if (!player) return { state: base, ok: false, message: "No player character." };
  const stock = { ...shop.stock, [itemId]: available - 1 };
  const shops = { ...base.shops, [shopId]: { ...shop, stock } };
  const entities = {
    ...base.entities,
    player: {
      ...player,
      inventory: addItemToInventory(player.inventory, itemId, 1),
    },
  };
  base = {
    ...base,
    party: { ...base.party, gold: base.party.gold - price },
    entities,
    shops,
    campaign: updated(base),
  };
  return { state: base, ok: true, message: `Bought ${item.name} for ${price} gp.` };
}

export function removeItemFromInventory(
  inventory: InventoryEntry[],
  itemId: string,
  quantity = 1,
): InventoryEntry[] {
  const existing = inventory.find((entry) => entry.itemId === itemId);
  if (!existing) return inventory;
  if (existing.quantity > quantity) {
    return inventory.map((entry) =>
      entry.itemId === itemId ? { ...entry, quantity: entry.quantity - quantity } : entry,
    );
  }
  return inventory.filter((entry) => entry.itemId !== itemId);
}

export function sellItem(state: GameState, shopId: string, itemId: string): ShopResult {
  let base = ensureShop(state, shopId);
  const shop = base.shops[shopId];
  const item = getItem(itemId);
  const player = base.entities.player;
  if (!shop || !item || !player) return { state: base, ok: false, message: "That cannot be sold here." };
  if (!player.inventory.some((entry) => entry.itemId === itemId)) {
    return { state: base, ok: false, message: "You do not carry that." };
  }
  if (Object.values(player.equipment).includes(itemId)) {
    return { state: base, ok: false, message: "Unequip that first." };
  }
  if (item.valueGold <= 0) return { state: base, ok: false, message: "No one will pay for that." };
  const price = shopItemPrice(shopId, itemId, "sell");
  const stock = { ...shop.stock, [itemId]: (shop.stock[itemId] ?? 0) + 1 };
  base = {
    ...base,
    party: { ...base.party, gold: base.party.gold + price },
    entities: {
      ...base.entities,
      player: {
        ...player,
        inventory: removeItemFromInventory(player.inventory, itemId, 1),
      },
    },
    shops: { ...base.shops, [shopId]: { ...shop, stock } },
    campaign: updated(base),
  };
  return { state: base, ok: true, message: `Sold ${item.name} for ${price} gp.` };
}

export interface RelationshipAdjustment {
  axis: "trust" | "affection" | "respect" | "fear";
  delta: number;
  reason: string;
}

export function adjustRelationship(
  state: GameState,
  npcId: string,
  change: RelationshipAdjustment,
): GameState {
  const current = state.relationships[npcId] ?? { trust: 0, affection: 0, respect: 0, fear: 0 };
  const value = Math.max(-100, Math.min(100, current[change.axis] + change.delta));
  return {
    ...state,
    relationships: {
      ...state.relationships,
      [npcId]: { ...current, [change.axis]: value },
    },
    campaign: updated(state),
  };
}

function questReady(quest: QuestState): boolean {
  return quest.objectives.length > 0 && quest.objectives.every((objective) => objective.complete);
}

export function questForNpc(state: GameState, npcId: string): QuestState | undefined {
  const npc = getNpcDefinition(npcId);
  if (!npc) return undefined;
  for (const questId of npc.questIds) {
    const quest = state.quests[questId];
    if (quest) return quest;
  }
  return Object.values(state.quests).find(
    (quest) =>
      (quest.status === "active" || quest.status === "completed") &&
      (quest.giverId === npcId || quest.flags.turnInNpcId === npcId),
  );
}

export function questTemplateForNpc(npcId: string) {
  const npc = getNpcDefinition(npcId);
  if (!npc) return undefined;
  return QUESTS.find((quest) => npc.questIds.includes(quest.id));
}

export function dialogueRootForNpc(state: GameState, npcId: string): string {
  const dialogue = getDialogueDefinition(getNpcDefinition(npcId)?.dialogueId ?? "");
  if (!dialogue) return "";
  const quest = questForNpc(state, npcId);
  if (!quest) return dialogue.roots.questAvailable ?? dialogue.roots.default;
  if (quest.status === "completed") return dialogue.roots.questComplete ?? dialogue.roots.default;
  if (quest.status === "active" && questReady(quest)) {
    return dialogue.roots.questReady ?? dialogue.roots.questActive ?? dialogue.roots.default;
  }
  if (quest.status === "active") return dialogue.roots.questActive ?? dialogue.roots.default;
  return dialogue.roots.questAvailable ?? dialogue.roots.default;
}

export interface DialogueStart {
  npc: NpcDefinition;
  dialogue: DialogueDefinition;
  nodeId: string;
  relationship: { trust: number; affection: number; respect: number; fear: number };
}

export function startDialogue(state: GameState, npcId: string): DialogueStart | null {
  const npc = getNpcDefinition(npcId);
  const dialogue = npc ? getDialogueDefinition(npc.dialogueId) : undefined;
  if (!npc || !dialogue) return null;
  const nodeId = dialogueRootForNpc(state, npcId);
  return {
    npc,
    dialogue,
    nodeId: dialogue.nodes[nodeId] ? nodeId : dialogue.roots.default,
    relationship: state.relationships[npcId] ?? { trust: 0, affection: 0, respect: 0, fear: 0 },
  };
}

export interface DialogueActionResult {
  state: GameState;
  message?: string;
  shopId?: string;
}

export function applyDialogueAction(
  state: GameState,
  npcId: string,
  action: DialogueAction,
): DialogueActionResult {
  switch (action.type) {
    case "end":
      return { state };
    case "accept_quest": {
      const result = acceptQuest(state, action.questId, npcId);
      return { state: result.state, message: result.message };
    }
    case "claim_quest": {
      const result = claimQuest(state, action.questId);
      return { state: result.state, message: result.message };
    }
    case "open_shop": {
      return { state: ensureShop(state, action.shopId), shopId: action.shopId };
    }
    case "recruit_companion": {
      const result = recruitCompanion(state, npcId);
      return { state: result.state, message: result.message };
    }
    case "dismiss_companion": {
      const result = dismissCompanion(state, npcId);
      return { state: result.state, message: result.message };
    }
    case "branch_quest": {
      const result = branchQuest(state, action.questId, action.branchId);
      return { state: result.state, message: result.message };
    }
    case "romance": {
      const result = romanceGate(state, npcId);
      return { state: result.state, message: result.message };
    }
    case "adjust_disposition": {
      return {
        state: adjustRelationship(state, npcId, {
          axis: action.axis,
          delta: action.delta,
          reason: action.reason,
        }),
        message: `${getNpcDefinition(npcId)?.name ?? "They"} will remember that.`,
      };
    }
    case "wait": {
      return {
        state: advanceTime(state, action.hours * 60),
        message: `You wait ${action.hours} hour${action.hours === 1 ? "" : "s"}.`,
      };
    }
    default:
      return { state };
  }
}

export interface QuestResult {
  state: GameState;
  message: string;
  questId?: string;
}

export function acceptQuest(state: GameState, templateId: string, giverId?: string): QuestResult {
  const template = getQuestTemplate(templateId);
  if (!template) return { state, message: "That quest is not available." };
  const existing = state.quests[templateId];
  if (existing && existing.status !== "failed" && existing.status !== "abandoned") {
    return { state, message: "You already have that task." };
  }
  const quest: QuestState = {
    id: template.id,
    templateId: template.id,
    title: template.title,
    summary: template.summary,
    giverId: giverId ?? template.giverNpcId,
    status: "active",
    stageId: "active",
    objectives: template.objectives.map((objective) => ({
      id: objective.id,
      kind: objective.kind,
      description: objective.description,
      ...(objective.targetId ? { targetId: objective.targetId } : {}),
      required: objective.required,
      progress: 0,
      complete: false,
    })),
    rewards: {
      gold: template.rewards.gold,
      items: template.rewards.itemIds,
      turnInNpcId: template.turnInNpcId,
    },
    flags: { templateId: template.id, turnInNpcId: template.turnInNpcId },
  };
  let next: GameState = {
    ...state,
    quests: { ...state.quests, [quest.id]: quest },
    world: {
      ...state.world,
      pois: state.world.pois.map((poi) =>
        template.objectives.some((objective) => objective.kind === "reach" && objective.targetId === poi.id)
          ? { ...poi, discovered: true }
          : poi,
      ),
    },
    campaign: updated(state),
  };
  next = adjustRelationship(next, template.giverNpcId, {
    axis: "trust",
    delta: 3,
    reason: `Accepted ${template.title}`,
  });
  next = progressQuests(next, { kind: "reach", targetId: state.local?.poiId ?? "" });
  return { state: next, message: `Quest accepted: ${template.title}`, questId: template.id };
}

export interface QuestTrigger {
  kind: QuestObjective["kind"];
  targetId: string;
  amount?: number;
}

export function progressQuests(state: GameState, trigger: QuestTrigger): GameState {
  let changed = false;
  const quests = { ...state.quests };
  for (const [index, quest] of Object.entries(state.quests)) {
    if (quest.status !== "active") continue;
    let questChanged = false;
    const objectives = quest.objectives.map((objective) => {
      if (objective.complete) return objective;
      if (objective.kind !== trigger.kind || !objective.targetId) return objective;
      if (objective.targetId !== trigger.targetId) return objective;
      const progress = Math.min(objective.required, objective.progress + (trigger.amount ?? 1));
      const complete = progress >= objective.required;
      if (!complete) {
        questChanged = true;
        return { ...objective, progress };
      }
      questChanged = true;
      return { ...objective, progress, complete: true };
    });
    if (!questChanged) continue;
    const allDone = objectives.length > 0 && objectives.every((objective) => objective.complete);
    quests[index] = {
      ...quest,
      objectives,
      stageId: allDone ? "ready" : quest.stageId,
    };
    changed = true;
  }
  if (!changed) return state;
  return { ...state, quests, campaign: updated(state) };
}

export function claimQuest(state: GameState, questId: string): QuestResult {
  const quest = state.quests[questId];
  if (!quest) return { state, message: "You have not accepted that task." };
  if (quest.status === "completed") return { state, message: "That task is already done." };
  if (quest.status !== "active") return { state, message: "That task cannot be completed now." };
  if (!questReady(quest)) return { state, message: "The task is not finished." };
  const template = getQuestTemplate(quest.templateId);
  const player = state.entities.player;
  if (!player) return { state, message: "The reward cannot be paid." };
  const rewardItems = template
    ? template.rewards.itemIds
    : Array.isArray(quest.rewards.items)
      ? (quest.rewards.items as Array<{ itemId: string; quantity?: number }>).filter(
          (entry) => typeof entry?.itemId === "string",
        )
      : [];
  const gold = template ? template.rewards.gold : Number(quest.rewards.gold ?? 0);
  const turnInNpcId = template
    ? template.turnInNpcId
    : String(quest.flags.turnInNpcId ?? quest.giverId ?? "");
  const title = template?.title ?? quest.title;
  let inventory = [...player.inventory];
  for (const item of rewardItems) {
    inventory = addItemToInventory(inventory, item.itemId, item.quantity ?? 1);
  }
  let next: GameState = {
    ...state,
    party: { ...state.party, gold: state.party.gold + gold },
    entities: {
      ...state.entities,
      player: { ...player, inventory },
    },
    quests: {
      ...state.quests,
      [questId]: { ...quest, status: "completed", stageId: "completed" },
    },
    campaign: updated(state),
  };
  if (turnInNpcId) {
    next = adjustRelationship(next, turnInNpcId, {
      axis: "trust",
      delta: 8,
      reason: `Completed ${title}`,
    });
    next = adjustRelationship(next, turnInNpcId, {
      axis: "respect",
      delta: 5,
      reason: `Completed ${title}`,
    });
  }
  if (typeof quest.flags.factionId === "string") {
    next = adjustFaction(next, quest.flags.factionId, 5, `Completed ${title}`);
  }
  return {
    state: next,
    message: `Quest complete: ${title}. Received ${gold} gp.`,
    questId,
  };
}

export function questRewardSummary(questId: string): string {
  const template = getQuestTemplate(questId);
  if (!template) return "";
  const items = template.rewards.itemIds
    .map((entry) => `${getItem(entry.itemId)?.name ?? entry.itemId} ×${entry.quantity}`)
    .join(", ");
  return [template.rewards.gold > 0 ? `${template.rewards.gold} gp` : "", items].filter(Boolean).join(" · ");
}

export function npcAppearance(npc: NpcDefinition): CharacterAppearance {
  return { palette: npc.palette, sigil: npc.sigil, seed: npc.id };
}

export function npcRelationship(state: GameState, npcId: string) {
  return state.relationships[npcId] ?? { trust: 0, affection: 0, respect: 0, fear: 0 };
}

export function localMapKey(hex: Hex): string {
  return hexKey(hex);
}
