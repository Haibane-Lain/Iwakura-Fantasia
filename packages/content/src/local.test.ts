import { describe, expect, it } from "vitest";
import {
  DIALOGUES,
  getLocalTile,
  ITEMS,
  LOCAL_MAPS,
  localTileFromChar,
  NPCS,
  QUESTS,
  SHOPS,
} from "./index.js";

function pointInside(width: number, height: number, point: { col: number; row: number }): boolean {
  return point.col >= 0 && point.row >= 0 && point.col < width && point.row < height;
}

describe("local content integrity", () => {
  it("has rectangular maps with walkable entrances and exits", () => {
    for (const map of LOCAL_MAPS) {
      const width = map.rows[0]?.length ?? 0;
      expect(width, map.id).toBeGreaterThan(4);
      for (const row of map.rows) expect(row.length, `${map.id} row ${row}`).toBe(width);
      expect(pointInside(width, map.rows.length, map.entrance), `${map.id} entrance`).toBe(true);
      const entranceTile = getLocalTile(localTileFromChar(map.rows[map.entrance.row]![map.entrance.col]!));
      expect(entranceTile.walkable, `${map.id} entrance walkable`).toBe(true);
      for (const exit of map.exits) {
        expect(pointInside(width, map.rows.length, exit.point), `${map.id} ${exit.id}`).toBe(true);
        const exitTile = getLocalTile(localTileFromChar(map.rows[exit.point.row]![exit.point.col]!));
        expect(exitTile.walkable, `${map.id} ${exit.id} walkable`).toBe(true);
      }
    }
  });

  it("places every spot and interaction on a walkable tile", () => {
    for (const map of LOCAL_MAPS) {
      const width = map.rows[0]?.length ?? 0;
      for (const [name, point] of Object.entries(map.spots)) {
        expect(pointInside(width, map.rows.length, point), `${map.id} spot ${name}`).toBe(true);
        const tile = getLocalTile(localTileFromChar(map.rows[point.row]![point.col]!));
        expect(tile.walkable, `${map.id} spot ${name} walkable`).toBe(true);
      }
      for (const interactable of map.interactables) {
        expect(pointInside(width, map.rows.length, interactable.point), `${map.id} ${interactable.id}`).toBe(
          true,
        );
      }
    }
  });

  it("references valid NPC schedules, dialogue, quests, and shops", () => {
    const mapIds = new Set(LOCAL_MAPS.map((map) => map.id));
    const dialogueIds = new Set(DIALOGUES.map((dialogue) => dialogue.id));
    const questIds = new Set(QUESTS.map((quest) => quest.id));
    const itemIds = new Set(ITEMS.map((item) => item.id));
    const shopIds = new Set(SHOPS.map((shop) => shop.id));
    for (const npc of NPCS) {
      expect(dialogueIds.has(npc.dialogueId), npc.id).toBe(true);
      for (const slot of npc.schedule) {
        expect(mapIds.has(slot.mapId), `${npc.id} → ${slot.mapId}`).toBe(true);
        const map = LOCAL_MAPS.find((entry) => entry.id === slot.mapId)!;
        expect(map.spots[slot.spot], `${npc.id} → ${slot.mapId}/${slot.spot}`).toBeDefined();
      }
      for (const questId of npc.questIds) expect(questIds.has(questId), `${npc.id} → ${questId}`).toBe(true);
      if (npc.shopId) expect(shopIds.has(npc.shopId), `${npc.id} → ${npc.shopId}`).toBe(true);
    }
    for (const booth of SHOPS) {
      for (const entry of booth.stock)
        expect(itemIds.has(entry.itemId), `${booth.id} → ${entry.itemId}`).toBe(true);
    }
    for (const quest of QUESTS) {
      expect(
        NPCS.some((npc) => npc.id === quest.giverNpcId),
        quest.id,
      ).toBe(true);
      expect(
        NPCS.some((npc) => npc.id === quest.turnInNpcId),
        quest.id,
      ).toBe(true);
      for (const reward of quest.rewards.itemIds) {
        expect(itemIds.has(reward.itemId), `${quest.id} → ${reward.itemId}`).toBe(true);
      }
    }
  });

  it("has valid dialogue links and roots", () => {
    for (const dialogue of DIALOGUES) {
      for (const root of Object.values(dialogue.roots)) {
        if (root) expect(dialogue.nodes[root], `${dialogue.id} root ${root}`).toBeDefined();
      }
      for (const node of Object.values(dialogue.nodes)) {
        for (const option of node.options) {
          if (option.next) {
            expect(dialogue.nodes[option.next], `${dialogue.id}/${node.id} → ${option.next}`).toBeDefined();
          }
        }
      }
    }
  });
});
