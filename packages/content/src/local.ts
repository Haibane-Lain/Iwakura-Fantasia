import type {
  DialogueDefinition,
  LocalMapDefinition,
  NpcDefinition,
  QuestTemplate,
  ShopDefinition,
} from "@iwakura/contracts";

export interface LocalTileDefinition {
  id: string;
  name: string;
  description: string;
  /** RGB integer used by PixiJS. */
  color: number;
  walkable: boolean;
}

export const LOCAL_TILES: LocalTileDefinition[] = [
  {
    id: "grass",
    name: "Green",
    description: "Trodden grass between the buildings.",
    color: 0x5c6a41,
    walkable: true,
  },
  {
    id: "field",
    name: "Field",
    description: "A narrow strip of crops and weeds.",
    color: 0x7b7044,
    walkable: true,
  },
  {
    id: "road",
    name: "Road",
    description: "Hard-packed earth and old stones.",
    color: 0x8b7959,
    walkable: true,
  },
  { id: "plaza", name: "Plaza", description: "A broad paved square.", color: 0x9a8a64, walkable: true },
  { id: "tree", name: "Trees", description: "A dense stand of trees.", color: 0x33472f, walkable: false },
  { id: "water", name: "Water", description: "Cold, dark water.", color: 0x2e5363, walkable: false },
  {
    id: "roof",
    name: "Building",
    description: "A shingled roof. The door is elsewhere.",
    color: 0x4a3a2d,
    walkable: false,
  },
  { id: "door", name: "Door", description: "A doorway into a building.", color: 0xb58b51, walkable: true },
  { id: "wood_floor", name: "Floor", description: "Worn boards underfoot.", color: 0x6a5138, walkable: true },
  {
    id: "stone_wall",
    name: "Stone wall",
    description: "Damp, close-fitting stone.",
    color: 0x211f1b,
    walkable: false,
  },
  {
    id: "stone_floor",
    name: "Stone floor",
    description: "Flagstones slick with old moisture.",
    color: 0x6d604c,
    walkable: true,
  },
  {
    id: "stone_door",
    name: "Stone doorway",
    description: "A low arch cut through the rock.",
    color: 0xa67c4b,
    walkable: true,
  },
  {
    id: "stairs",
    name: "Stairs",
    description: "Steps back toward the surface.",
    color: 0xc9a35a,
    walkable: true,
  },
  {
    id: "altar",
    name: "Altar",
    description: "A slab worn smooth by old hands.",
    color: 0x7b5f8c,
    walkable: true,
  },
  {
    id: "crate",
    name: "Crates",
    description: "Stacked crates and broken shelving.",
    color: 0x7c5b39,
    walkable: false,
  },
  {
    id: "bridge",
    name: "Bridge",
    description: "Planks over running water.",
    color: 0x6e5d40,
    walkable: true,
  },
];

const LOCAL_TILE_BY_ID = new Map(LOCAL_TILES.map((tile) => [tile.id, tile]));

export function getLocalTile(id: string): LocalTileDefinition {
  return LOCAL_TILE_BY_ID.get(id) ?? LOCAL_TILES[0]!;
}

export const LOCAL_LEGEND: Record<string, string> = {
  ".": "grass",
  ",": "field",
  r: "road",
  p: "plaza",
  t: "tree",
  w: "water",
  b: "roof",
  d: "door",
  f: "wood_floor",
  "#": "stone_wall",
  "=": "stone_floor",
  "+": "stone_door",
  ">": "stairs",
  a: "altar",
  c: "crate",
  x: "bridge",
};

export function localTileFromChar(char: string): string {
  return LOCAL_LEGEND[char] ?? "grass";
}

interface Grid {
  width: number;
  height: number;
  cells: string[][];
}

function makeGrid(width: number, height: number, fill: string): Grid {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () => Array.from({ length: width }, () => fill)),
  };
}

function setCell(grid: Grid, col: number, row: number, char: string): void {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return;
  grid.cells[row]![col] = char;
}

function fillRect(grid: Grid, col: number, row: number, width: number, height: number, char: string): void {
  for (let y = row; y < row + height; y += 1) {
    for (let x = col; x < col + width; x += 1) setCell(grid, x, y, char);
  }
}

function rowsOf(grid: Grid): string[] {
  return grid.cells.map((row) => row.join(""));
}

function borderTrees(width: number, height: number): Grid {
  const grid = makeGrid(width, height, ".");
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) setCell(grid, x, y, "t");
      else if ((x + y) % 13 === 0) setCell(grid, x, y, ",");
      else if ((x * 3 + y * 5) % 17 === 0) setCell(grid, x, y, "t");
    }
  }
  return grid;
}

function buildRedford(): string[] {
  const grid = borderTrees(17, 11);
  for (let y = 1; y <= 9; y += 1) fillRect(grid, 7, y, 3, 1, "r");
  fillRect(grid, 1, 5, 15, 1, "r");
  fillRect(grid, 5, 4, 7, 3, "p");

  fillRect(grid, 2, 1, 4, 3, "b");
  setCell(grid, 3, 3, "d");
  fillRect(grid, 12, 1, 4, 3, "b");
  setCell(grid, 13, 3, "d");
  fillRect(grid, 2, 7, 4, 3, "b");
  setCell(grid, 3, 7, "d");
  fillRect(grid, 12, 7, 4, 3, "b");
  setCell(grid, 13, 7, "d");

  setCell(grid, 1, 4, "t");
  setCell(grid, 15, 4, "t");
  setCell(grid, 1, 6, "t");
  setCell(grid, 15, 6, "t");
  setCell(grid, 3, 9, ",");
  setCell(grid, 4, 9, ",");
  setCell(grid, 2, 8, ",");
  setCell(grid, 8, 10, ">");
  setCell(grid, 8, 9, "r");
  return rowsOf(grid);
}

function buildMillbrook(): string[] {
  const grid = borderTrees(13, 9);
  for (let y = 1; y <= 7; y += 1) setCell(grid, 6, y, "r");
  fillRect(grid, 1, 4, 11, 1, "r");
  fillRect(grid, 4, 4, 5, 2, "p");

  fillRect(grid, 1, 1, 3, 2, "b");
  setCell(grid, 2, 2, "d");
  fillRect(grid, 9, 1, 3, 2, "b");
  setCell(grid, 10, 2, "d");
  fillRect(grid, 1, 6, 3, 2, "b");
  setCell(grid, 2, 6, "d");
  fillRect(grid, 9, 6, 3, 2, "b");
  setCell(grid, 10, 6, "d");

  setCell(grid, 5, 6, "w");
  setCell(grid, 6, 6, "x");
  setCell(grid, 6, 8, ">");
  setCell(grid, 6, 7, "r");
  setCell(grid, 1, 3, ",");
  setCell(grid, 2, 3, ",");
  setCell(grid, 3, 3, ",");
  return rowsOf(grid);
}

function buildCrypt(): string[] {
  const grid = makeGrid(15, 9, "#");
  fillRect(grid, 1, 6, 4, 2, "=");
  fillRect(grid, 4, 6, 4, 1, "=");
  fillRect(grid, 6, 3, 6, 4, "=");
  fillRect(grid, 8, 1, 1, 3, "=");
  fillRect(grid, 8, 1, 6, 2, "=");
  fillRect(grid, 8, 4, 3, 1, "=");

  setCell(grid, 2, 7, ">");
  setCell(grid, 8, 3, "a");
  setCell(grid, 11, 1, "c");
  setCell(grid, 12, 2, "=");
  setCell(grid, 9, 6, "+");
  setCell(grid, 7, 4, "+");
  setCell(grid, 11, 2, "=");
  setCell(grid, 5, 3, "c");
  setCell(grid, 12, 3, "c");
  setCell(grid, 2, 6, "=");
  return rowsOf(grid);
}

export const LOCAL_MAPS: LocalMapDefinition[] = [
  {
    id: "core:redford_town",
    name: "Redford",
    kind: "town",
    worldPoiId: "core:redford",
    description: "A market town on the river, built around a stone ford that predates the current walls.",
    rows: buildRedford(),
    entrance: { col: 8, row: 8 },
    buildings: [
      {
        id: "core:redford_market",
        name: "Redford Market",
        kind: "shop",
        door: { col: 3, row: 3 },
        description: "A long timber hall of stalls, salt fish, and borrowed credit.",
        shopId: "core:redford_market",
      },
      {
        id: "core:ford_flagon",
        name: "The Ford & Flagon",
        kind: "inn",
        door: { col: 13, row: 3 },
        description: "A low inn with good bread, thin ale, and a fire that never quite dries the walls.",
      },
      {
        id: "core:miller_hall",
        name: "Miller's Hall",
        kind: "hall",
        door: { col: 3, row: 7 },
        description: "The old millers' hall, its signboard repainted more often than its roof.",
      },
      {
        id: "core:ford_chapel",
        name: "Chapel of the Ford",
        kind: "temple",
        door: { col: 13, row: 7 },
        description: "A small stone chapel with a bell that rings only in rough weather.",
      },
    ],
    exits: [
      {
        id: "core:redford_world_exit",
        name: "South Road",
        point: { col: 8, row: 10 },
        description: "The road south, back toward the river crossing and the wider valley.",
        target: "world",
      },
    ],
    interactables: [
      {
        id: "core:redford_notice_board",
        name: "Notice board",
        kind: "sign",
        point: { col: 9, row: 5 },
        description: "Weather warnings, a reward for wolves, and a notice in the miller's hand.",
        oneShot: false,
      },
    ],
    encounters: [],
    spots: {
      market: { col: 8, row: 5 },
      market_stall: { col: 9, row: 5 },
      gate: { col: 8, row: 9 },
      inn: { col: 13, row: 4 },
      chapel: { col: 13, row: 6 },
      mill_hall: { col: 3, row: 6 },
      field: { col: 4, row: 9 },
      home: { col: 3, row: 6 },
    },
    npcIds: ["core:hessa", "core:bryn", "core:maud", "core:aveline", "core:tam"],
  },
  {
    id: "core:millbrook_village",
    name: "Millbrook",
    kind: "village",
    worldPoiId: "core:millbrook",
    description: "A village of millers and charcoal burners. The mill wheel has not turned in three days.",
    rows: buildMillbrook(),
    entrance: { col: 6, row: 7 },
    buildings: [
      {
        id: "core:millbrook_mill",
        name: "Millbrook Mill",
        kind: "workshop",
        door: { col: 10, row: 2 },
        description: "A squat stone mill over a race of dark water. The wheel stands still.",
      },
      {
        id: "core:barley_sheaf",
        name: "The Barley Sheaf",
        kind: "inn",
        door: { col: 2, row: 2 },
        description: "Two rooms, one hearth, and a landlord who knows when to stop asking questions.",
      },
      {
        id: "core:millbrook_chapel",
        name: "Chapel of the Ford",
        kind: "temple",
        door: { col: 2, row: 6 },
        description: "A mossy chapel with a cracked bell and a bowl of river pebbles by the door.",
      },
      {
        id: "core:charcoal_shed",
        name: "Charcoal Shed",
        kind: "workshop",
        door: { col: 10, row: 6 },
        description: "The air around the shed tastes of soot and wet ash.",
      },
    ],
    exits: [
      {
        id: "core:millbrook_world_exit",
        name: "Mill Road",
        point: { col: 6, row: 8 },
        description: "The mill road, back toward the wider valley.",
        target: "world",
      },
    ],
    interactables: [
      {
        id: "core:millbrook_millstone",
        name: "Still millstone",
        kind: "object",
        point: { col: 9, row: 3 },
        description: "The great wheel is jammed. Something pale is caught between the spokes.",
        oneShot: false,
      },
    ],
    encounters: [],
    spots: {
      mill: { col: 10, row: 3 },
      green: { col: 4, row: 3 },
      gate: { col: 6, row: 7 },
      inn: { col: 2, row: 3 },
      chapel: { col: 2, row: 5 },
      field: { col: 3, row: 3 },
      shed: { col: 10, row: 5 },
      home: { col: 9, row: 3 },
    },
    npcIds: ["core:oren", "core:wren"],
  },
  {
    id: "core:old_mill_crypt",
    name: "The Old Mill Crypt",
    kind: "dungeon",
    worldPoiId: "core:old_mill_crypt",
    description:
      "The hill above the mill is hollow. Someone has reopened the old undercroft, and the air remembers them.",
    rows: buildCrypt(),
    entrance: { col: 2, row: 6 },
    buildings: [],
    exits: [
      {
        id: "core:crypt_world_exit",
        name: "Stairs to the surface",
        point: { col: 2, row: 7 },
        description: "The steps back up to the hill and the quiet mill road.",
        target: "world",
      },
    ],
    interactables: [
      {
        id: "core:crypt_ledger",
        name: "Mill ledger",
        kind: "object",
        point: { col: 12, row: 2 },
        description: "A water-stained ledger, its last entries written in a shaking hand.",
        itemId: "core:mills_ledger",
        oneShot: true,
      },
      {
        id: "core:crypt_altar",
        name: "Bone altar",
        kind: "altar",
        point: { col: 8, row: 3 },
        description: "A slab of pale stone. The scratches on it are not writing, but they repeat.",
        oneShot: false,
      },
    ],
    encounters: [
      {
        id: "core:crypt_shades",
        name: "Shades in the undercroft",
        point: { col: 8, row: 6 },
        radius: 1,
        description: "Something moves between the pillars, keeping just out of the light.",
      },
    ],
    spots: {
      entrance: { col: 2, row: 6 },
      altar: { col: 8, row: 4 },
      ledger: { col: 12, row: 2 },
    },
    npcIds: [],
  },
  {
    id: "core:generic_settlement",
    name: "Settlement",
    kind: "village",
    description: "A small settlement of fields, smoke, and roads that remember older travellers.",
    rows: buildMillbrook(),
    entrance: { col: 6, row: 7 },
    buildings: [
      {
        id: "core:generic_market",
        name: "Market",
        kind: "shop",
        door: { col: 2, row: 2 },
        description: "A stall under a patched awning. What it lacks in choice it makes up for in road dust.",
        shopId: "core:traveling_market",
      },
      {
        id: "core:generic_inn",
        name: "The Wayside Inn",
        kind: "inn",
        door: { col: 10, row: 2 },
        description: "A low inn with one good room and a landlord who has seen stranger travellers.",
      },
      {
        id: "core:generic_chapel",
        name: "Roadside Chapel",
        kind: "temple",
        door: { col: 2, row: 6 },
        description: "A chapel with a blank dedication and a bowl of dry flowers.",
      },
    ],
    exits: [
      {
        id: "core:generic_settlement_exit",
        name: "The Road Out",
        point: { col: 6, row: 8 },
        description: "The road back into the wider valley.",
        target: "world",
      },
    ],
    interactables: [],
    encounters: [],
    spots: {
      mill: { col: 10, row: 3 },
      green: { col: 4, row: 3 },
      gate: { col: 6, row: 7 },
      inn: { col: 10, row: 3 },
      chapel: { col: 2, row: 5 },
      field: { col: 3, row: 3 },
      shed: { col: 10, row: 5 },
      home: { col: 9, row: 3 },
    },
    npcIds: ["core:sable"],
  },
  {
    id: "core:generic_dungeon",
    name: "Old Crypt",
    kind: "dungeon",
    description: "An old undercroft beneath a hill. The stones remember a different kind of silence.",
    rows: buildCrypt(),
    entrance: { col: 2, row: 6 },
    buildings: [],
    exits: [
      {
        id: "core:generic_dungeon_exit",
        name: "Stairs to the surface",
        point: { col: 2, row: 7 },
        description: "The steps back up to the hill.",
        target: "world",
      },
    ],
    interactables: [],
    encounters: [],
    spots: {
      entrance: { col: 2, row: 6 },
      altar: { col: 8, row: 4 },
    },
    npcIds: [],
  },
];

export function getLocalMapDefinition(id: string): LocalMapDefinition | undefined {
  return LOCAL_MAPS.find((map) => map.id === id);
}

export function getLocalMapForPoi(poiId: string): LocalMapDefinition | undefined {
  return LOCAL_MAPS.find((map) => map.worldPoiId === poiId);
}

const REDFORD = "core:redford_town";
const MILLBROOK = "core:millbrook_village";

export const NPCS: NpcDefinition[] = [
  {
    id: "core:hessa",
    name: "Hessa Vale",
    pronouns: "she/her",
    ancestryId: "core:human",
    role: "Miller of Redford",
    description:
      "A broad-shouldered woman with flour in her cuffs and a temper worn thin by three bad nights.",
    palette: "gold",
    sigil: "hex",
    schedule: [
      { fromHour: 8, toHour: 18, mapId: REDFORD, spot: "market", activity: "arguing with suppliers" },
      { fromHour: 18, toHour: 22, mapId: REDFORD, spot: "inn", activity: "nursing a cup she does not drink" },
      { fromHour: 22, toHour: 8, mapId: REDFORD, spot: "mill_hall", activity: "barred indoors" },
    ],
    dialogueId: "core:hessa_dialogue",
    questIds: ["core:the_stopped_mill"],
    persona: {
      id: "core:hessa",
      name: "Hessa Vale",
      pronouns: "she/her",
      role: "Miller of Redford",
      summary:
        "Hessa keeps the mill and the accounts. Her workers have not come back from the hill, and she is trying not to show how frightened she is.",
      voice: "Blunt, practical, and dry. She answers questions with questions when she is worried.",
      goals: ["Find out what happened at the old mill", "Keep the mill from being taken for debt"],
      fears: ["The mill being condemned", "What she will find in the crypt"],
      secrets: ["She has been paying the mill's debts from her own purse"],
      knowledge: ["The mill wheel stopped three days ago", "The old crypt was sealed until last week"],
      sampleLines: ["If you're selling something, be quick. If you're buying, be quicker."],
      archetype: "merchant",
      recruitable: false,
    },
  },
  {
    id: "core:bryn",
    name: "Bryn Ash",
    pronouns: "they/them",
    ancestryId: "core:human",
    role: "Market trader",
    description: "A quick-eyed trader with a stall of practical goods and a memory for faces.",
    palette: "ember",
    sigil: "sword",
    schedule: [
      { fromHour: 7, toHour: 19, mapId: REDFORD, spot: "market_stall", activity: "calling prices" },
      { fromHour: 19, toHour: 22, mapId: REDFORD, spot: "inn", activity: "counting the day's take" },
      { fromHour: 22, toHour: 7, mapId: REDFORD, spot: "home", activity: "shuttered for the night" },
    ],
    dialogueId: "core:bryn_dialogue",
    shopId: "core:redford_market",
    questIds: [],
    persona: {
      id: "core:bryn",
      name: "Bryn Ash",
      pronouns: "they/them",
      role: "Market trader in Redford",
      summary:
        "Bryn sells what travellers need and buys what they should not be carrying. They are friendly until someone tries to cheat them.",
      voice: "Fast, warm, and mercantile. Enjoys a bargain and a good story.",
      goals: ["Make a profit", "Hear the best rumor first"],
      fears: ["Being cheated", "Running out of healing draughts"],
      secrets: ["They overcharge the miller on principle"],
      knowledge: ["The south road is clear", "The mill's workers have not been seen"],
      sampleLines: ["Friends get a discount. Strangers get a price."],
      archetype: "merchant",
      recruitable: false,
    },
  },
  {
    id: "core:maud",
    name: "Maud Orrick",
    pronouns: "she/her",
    ancestryId: "core:dwarf",
    role: "Captain of the Redford watch",
    description:
      "A short, grey-haired captain with a watchman's patience and a soldier's contempt for wasted words.",
    palette: "ink",
    sigil: "eye",
    schedule: [
      { fromHour: 6, toHour: 20, mapId: REDFORD, spot: "gate", activity: "watching the south road" },
      { fromHour: 20, toHour: 24, mapId: REDFORD, spot: "inn", activity: "taking her one cup" },
      { fromHour: 0, toHour: 6, mapId: REDFORD, spot: "home", activity: "off watch" },
    ],
    dialogueId: "core:maud_dialogue",
    questIds: ["core:greywatch_watch"],
    persona: {
      id: "core:maud",
      name: "Maud Orrick",
      pronouns: "she/her",
      role: "Captain of the Redford watch",
      summary:
        "Maud keeps the gate and the peace. She has buried enough adventurers to distrust heroics, but she still needs someone willing to look at Greywatch.",
      voice: "Flat, clipped, and dry. She respects competence and dislikes speeches.",
      goals: ["Keep Redford's roads open", "Find out why the Greywatch beacon is lit"],
      fears: ["Losing another watchman", "A fire in the market"],
      secrets: ["She sent a watchman to Greywatch and has not reported him missing"],
      knowledge: ["A light was seen at Greywatch Ruin", "The Old Mill Crypt was opened recently"],
      sampleLines: ["Say what you need, then say what you'll pay for it."],
      archetype: "guard",
      recruitable: false,
    },
  },
  {
    id: "core:aveline",
    name: "Sister Aveline",
    pronouns: "she/her",
    ancestryId: "core:human",
    role: "Keeper of the Chapel of the Ford",
    description:
      "A young priest with ink-stained fingers and a habit of listening longer than people expect.",
    palette: "frost",
    sigil: "moon",
    schedule: [
      { fromHour: 6, toHour: 19, mapId: REDFORD, spot: "chapel", activity: "keeping the chapel" },
      { fromHour: 19, toHour: 22, mapId: REDFORD, spot: "inn", activity: "sharing bread with travellers" },
      { fromHour: 22, toHour: 6, mapId: REDFORD, spot: "chapel", activity: "watching the ford" },
    ],
    dialogueId: "core:aveline_dialogue",
    questIds: [],
    persona: {
      id: "core:aveline",
      name: "Sister Aveline",
      pronouns: "she/her",
      role: "Keeper of the Chapel of the Ford",
      summary:
        "Aveline tends the shrine and the small rites of the river. She believes the old crypt was sealed for a reason.",
      voice: "Quiet, careful, and unexpectedly sharp when doctrine gets in the way of people.",
      goals: ["Keep the ford's rites", "Understand what has been disturbed"],
      fears: ["The crypt's old covenant being broken"],
      secrets: ["She has dreamed of the bone altar since the mill stopped"],
      knowledge: ["The crypt is older than the mill", "The shrine coins have been disappearing"],
      sampleLines: ["The river takes what it is given. It does not like to be cheated."],
      archetype: "clergy",
      recruitable: false,
    },
  },
  {
    id: "core:tam",
    name: "Tam Reed",
    pronouns: "he/him",
    ancestryId: "core:human",
    role: "Fieldhand",
    description: "A young fieldhand with a bruised knuckle and a talent for being where trouble starts.",
    palette: "verdant",
    sigil: "leaf",
    schedule: [
      { fromHour: 6, toHour: 18, mapId: REDFORD, spot: "field", activity: "clearing the south field" },
      { fromHour: 18, toHour: 21, mapId: REDFORD, spot: "inn", activity: "spending his wages" },
      { fromHour: 21, toHour: 6, mapId: REDFORD, spot: "home", activity: "asleep" },
    ],
    dialogueId: "core:tam_dialogue",
    questIds: [],
    persona: {
      id: "core:tam",
      name: "Tam Reed",
      pronouns: "he/him",
      role: "Fieldhand in Redford",
      summary:
        "Tam is young, curious, and convinced he is braver than he is. He saw something on the hill and has been avoiding the road since.",
      voice: "Eager, a little too loud, and prone to oversharing.",
      goals: ["Be taken seriously", "Avoid the hill after dark"],
      fears: ["The lights in the crypt", "Being thought a coward"],
      secrets: ["He took a coin from the shrine and cannot make himself put it back"],
      knowledge: [
        "Something pale was seen near the mill",
        "The Greywatch beacon burned for an hour last night",
      ],
      sampleLines: ["I'm not scared. I'm just... keeping my feet warm."],
      archetype: "civilian",
      recruitable: false,
    },
  },
  {
    id: "core:oren",
    name: "Oren Vale",
    pronouns: "he/him",
    ancestryId: "core:human",
    role: "Miller of Millbrook",
    description: "Hessa's brother, thinner and quieter, with a miller's chalk on his sleeves.",
    palette: "moss",
    sigil: "flame",
    schedule: [
      { fromHour: 6, toHour: 19, mapId: MILLBROOK, spot: "mill", activity: "staring at the jammed wheel" },
      { fromHour: 19, toHour: 22, mapId: MILLBROOK, spot: "inn", activity: "drinking too slowly" },
      { fromHour: 22, toHour: 6, mapId: MILLBROOK, spot: "home", activity: "asleep" },
    ],
    dialogueId: "core:oren_dialogue",
    questIds: [],
    persona: {
      id: "core:oren",
      name: "Oren Vale",
      pronouns: "he/him",
      role: "Miller of Millbrook",
      summary:
        "Oren ran the mill until the wheel stopped. He is ashamed of being frightened and frightened of what his sister will do.",
      voice: "Hesitant and apologetic, with sudden flashes of stubbornness.",
      goals: ["Get the mill working", "Keep Hessa from going up the hill alone"],
      fears: ["The thing in the race", "Hessa's anger"],
      secrets: ["He saw the crypt door open and said nothing"],
      knowledge: [
        "The wheel jammed on the same night the crypt opened",
        "There is a ledger missing from the mill",
      ],
      sampleLines: ["I didn't see anything. That's the truth. Mostly."],
      archetype: "civilian",
      recruitable: false,
    },
  },
  {
    id: "core:wren",
    name: "Wren",
    pronouns: "they/them",
    ancestryId: "core:elf",
    role: "Charcoal burner",
    description: "A patient, soot-stained outlander who sells charcoal and hears everything from the trees.",
    palette: "ink",
    sigil: "hex",
    schedule: [
      { fromHour: 5, toHour: 17, mapId: MILLBROOK, spot: "shed", activity: "banking the charcoal fire" },
      { fromHour: 17, toHour: 20, mapId: MILLBROOK, spot: "green", activity: "watching the light fade" },
      { fromHour: 20, toHour: 5, mapId: MILLBROOK, spot: "chapel", activity: "sleeping by the chapel wall" },
    ],
    dialogueId: "core:wren_dialogue",
    questIds: [],
    persona: {
      id: "core:wren",
      name: "Wren",
      pronouns: "they/them",
      role: "Charcoal burner near Millbrook",
      summary:
        "Wren has lived at the edge of the wood for longer than most villagers remember. They speak plainly and notice more than they say.",
      voice: "Slow, quiet, and precise. Uses few words and dislikes being hurried.",
      goals: ["Keep the wood quiet", "Learn what disturbed the undercroft"],
      fears: ["Fire in the dry season", "The old covenant waking"],
      secrets: ["They have seen the miller's missing ledger in the crypt"],
      knowledge: ["The crypt door was opened by men from the south", "The mill race runs under the hill"],
      sampleLines: ["The trees heard it before we did."],
      archetype: "outlaw",
      recruitable: false,
    },
  },
  {
    id: "core:sable",
    name: "Sable",
    pronouns: "they/them",
    ancestryId: "core:human",
    role: "Road trader",
    description: "A road-worn trader with a patched coat and a stall that fits on a mule.",
    palette: "ember",
    sigil: "moon",
    schedule: [
      {
        fromHour: 8,
        toHour: 18,
        mapId: "core:generic_settlement",
        spot: "green",
        activity: "trading with the village",
      },
      {
        fromHour: 18,
        toHour: 22,
        mapId: "core:generic_settlement",
        spot: "inn",
        activity: "counting the day's coin",
      },
      {
        fromHour: 22,
        toHour: 8,
        mapId: "core:generic_settlement",
        spot: "home",
        activity: "sleeping under the cart",
      },
    ],
    dialogueId: "core:sable_dialogue",
    shopId: "core:traveling_market",
    questIds: [],
    persona: {
      id: "core:sable",
      name: "Sable",
      pronouns: "they/them",
      role: "Road trader in a small settlement",
      summary:
        "Sable follows the roads between small settlements, selling what people forgot to bring and buying what they are eager to be rid of.",
      voice: "Dry, friendly, and always half a step ahead of the conversation.",
      goals: ["Reach the next market", "Hear a rumour worth carrying"],
      fears: ["A closed road", "A buyer with a long memory"],
      secrets: ["They have been avoiding Redford for a season"],
      knowledge: ["The roads are quieter than usual", "Something under the hills has woken"],
      sampleLines: ["If it fits on the mule, it fits in the price."],
      archetype: "merchant",
      recruitable: false,
    },
  },
];

export function getNpcDefinition(id: string): NpcDefinition | undefined {
  return NPCS.find((npc) => npc.id === id);
}

export const DIALOGUES: DialogueDefinition[] = [
  {
    id: "core:hessa_dialogue",
    npcId: "core:hessa",
    roots: {
      default: "greet",
      questAvailable: "offer",
      questActive: "active",
      questReady: "ready",
      questComplete: "done",
    },
    nodes: {
      greet: {
        id: "greet",
        text: 'Hessa looks up from a tally board she has not written on in some time. "You\'re not from the mill. Good. What do you want?"',
        options: [
          { id: "work", text: "You look like you could use help.", next: "offer" },
          { id: "mill", text: "What happened at the mill?", next: "offer" },
          { id: "bye", text: "Nothing. Good day.", action: { type: "end" } },
        ],
      },
      offer: {
        id: "offer",
        text: '"Three days ago the wheel stopped. My people went up to the old crypt to see why. None of them came back." She taps the tally board. "I need someone to find them, or at least find the ledger. It has the debts, the contracts, everything."',
        options: [
          {
            id: "accept",
            text: "I'll go to the crypt and find your ledger.",
            action: { type: "accept_quest", questId: "core:the_stopped_mill" },
          },
          { id: "where", text: "Where is this crypt?", next: "where" },
          { id: "no", text: "Not my trouble.", action: { type: "end" } },
        ],
      },
      where: {
        id: "where",
        text: '"East, under the hill above the old race. The Greywatch road will take you most of the way. Take a light. And don\'t trust the pale things between the pillars."',
        options: [
          {
            id: "accept",
            text: "I'll find the ledger.",
            action: { type: "accept_quest", questId: "core:the_stopped_mill" },
          },
          { id: "back", text: "I need to think.", action: { type: "end" } },
        ],
      },
      active: {
        id: "active",
        text: '"You\'re still here? The crypt is east, under the hill. My people are still missing, and I still need that ledger."',
        options: [
          { id: "hint", text: "Tell me about the crypt again.", next: "where" },
          { id: "bye", text: "I'm going.", action: { type: "end" } },
        ],
      },
      ready: {
        id: "ready",
        text: 'Hessa takes the ledger with both hands. For a moment she looks much older. "This is it. This is all of it." She reaches under the counter and puts a purse on the wood. "Take this. And if you find who did this, don\'t come back alone."',
        options: [
          {
            id: "claim",
            text: "Hand over the ledger and take the payment.",
            action: { type: "claim_quest", questId: "core:the_stopped_mill" },
          },
          { id: "later", text: "Not yet. I have questions.", next: "active" },
        ],
      },
      done: {
        id: "done",
        text: '"The wheel turns again. Slowly. The mill keeps its debts, and I keep my people\'s names." She nods at you. "You\'re welcome at my table."',
        options: [{ id: "bye", text: "Good. Keep the wheel turning.", action: { type: "end" } }],
      },
    },
  },
  {
    id: "core:bryn_dialogue",
    npcId: "core:bryn",
    roots: { default: "greet" },
    nodes: {
      greet: {
        id: "greet",
        text: 'Bryn spreads their hands over a stall of knives, rope, and dusty bottles. "Welcome to the best prices this side of the ford. What are you after?"',
        options: [
          {
            id: "shop",
            text: "Show me your wares.",
            action: { type: "open_shop", shopId: "core:redford_market" },
          },
          { id: "news", text: "What's the talk?", next: "news" },
          { id: "bye", text: "Just looking.", action: { type: "end" } },
        ],
      },
      news: {
        id: "news",
        text: "\"The miller's people haven't come back from the hill. Hessa's been buying lamp oil by the crate and pretending it's for the mill. And Captain Maud has been watching the south road like it owes her money.\"",
        options: [
          { id: "back", text: "Anything else?", next: "greet" },
          { id: "bye", text: "That's enough for now.", action: { type: "end" } },
        ],
      },
    },
  },
  {
    id: "core:maud_dialogue",
    npcId: "core:maud",
    roots: {
      default: "greet",
      questAvailable: "offer",
      questActive: "active",
      questReady: "ready",
      questComplete: "done",
    },
    nodes: {
      greet: {
        id: "greet",
        text: "Maud watches the road, not you. \"Gate's open. Trouble's extra.\"",
        options: [
          { id: "watch", text: "What trouble?", next: "offer" },
          { id: "shrine", text: "Anything strange at the shrine?", next: "shrine" },
          { id: "bye", text: "I'll keep moving.", action: { type: "end" } },
        ],
      },
      offer: {
        id: "offer",
        text: '"A light burned at Greywatch Ruin last night. I sent a watchman to look. He hasn\'t come back." She finally looks at you. "I need someone who isn\'t on my roster to go and see. Quietly."',
        options: [
          {
            id: "accept",
            text: "I'll go to Greywatch.",
            action: { type: "accept_quest", questId: "core:greywatch_watch" },
          },
          { id: "no", text: "Quietly is not my strong suit.", action: { type: "end" } },
        ],
      },
      active: {
        id: "active",
        text: "\"Greywatch is southeast. If you find my watchman, tell him he's still on duty. If you find what lit the beacon, don't bring it back to my gate.\"",
        options: [{ id: "bye", text: "Understood.", action: { type: "end" } }],
      },
      ready: {
        id: "ready",
        text: 'Maud listens without interrupting. When you finish, she sets a coin purse on the wall. "That\'s for the watchman. This is for you."',
        options: [
          {
            id: "claim",
            text: "Take the payment.",
            action: { type: "claim_quest", questId: "core:greywatch_watch" },
          },
          { id: "back", text: "Keep it. I'm not done.", action: { type: "end" } },
        ],
      },
      done: {
        id: "done",
        text: '"Quiet roads are good roads. If you see anything else, my gate is open."',
        options: [{ id: "bye", text: "Good night, Captain.", action: { type: "end" } }],
      },
      shrine: {
        id: "shrine",
        text: "\"Aveline keeps the shrine. She's been quiet lately, even for a priest. If you're going that way, ask her about the missing coins yourself.\"",
        options: [{ id: "back", text: "I will.", next: "greet" }],
      },
    },
  },
  {
    id: "core:aveline_dialogue",
    npcId: "core:aveline",
    roots: { default: "greet" },
    nodes: {
      greet: {
        id: "greet",
        text: 'Sister Aveline is sorting river pebbles into a bowl. "The ford is old. People forget that old things have long memories."',
        options: [
          { id: "crypt", text: "What do you know about the old crypt?", next: "crypt" },
          { id: "shrine", text: "People say coins are missing from the shrine.", next: "shrine" },
          { id: "bye", text: "Peace to you.", action: { type: "end" } },
        ],
      },
      crypt: {
        id: "crypt",
        text: '"It was sealed when the mill was built. The seal was not a lock. It was a promise." She looks toward the hill. "Someone has broken it, and the hill is answering."',
        options: [{ id: "back", text: "Thank you, Sister.", next: "greet" }],
      },
      shrine: {
        id: "shrine",
        text: '"Coins go missing in every lean season. But this time, the bowl was not emptied. One coin was taken, and a mark was left in its place." She shows you a scraped spiral on the stone.',
        options: [{ id: "back", text: "I'll keep my eyes open.", next: "greet" }],
      },
    },
  },
  {
    id: "core:tam_dialogue",
    npcId: "core:tam",
    roots: { default: "greet" },
    nodes: {
      greet: {
        id: "greet",
        text: 'Tam straightens too quickly when you approach. "I\'m fine. Just... resting. On my feet. What do you need?"',
        options: [
          { id: "hill", text: "Did you see something on the hill?", next: "hill" },
          { id: "shrine", text: "Do you know anything about the shrine coins?", next: "coin" },
          { id: "bye", text: "Nothing. Stay out of trouble.", action: { type: "end" } },
        ],
      },
      hill: {
        id: "hill",
        text: '"I saw a light in the old crypt. Pale, not like a lamp. And then I heard someone laughing. I came straight back." He rubs his bruised knuckle. "I didn\'t run. I walked quickly."',
        options: [{ id: "back", text: "That's more than most would do.", next: "greet" }],
      },
      coin: {
        id: "coin",
        text: "Tam's face goes carefully blank. \"Coins go missing. That's what coins do. If you're looking for a thief, try the south road.\"",
        options: [
          { id: "press", text: "You took one.", next: "confess" },
          { id: "drop", text: "I'll ask elsewhere.", next: "greet" },
        ],
      },
      confess: {
        id: "confess",
        text: '"It was one coin. I was hungry. I\'ll put it back." He looks at the ground. "I just haven\'t had the nerve to go back to the shrine."',
        options: [
          {
            id: "tell",
            text: "Tell Aveline. She'll understand.",
            action: {
              type: "adjust_disposition",
              axis: "respect",
              delta: 4,
              reason: "Confronted Tam gently",
            },
          },
          { id: "leave", text: "That's between you and the river.", action: { type: "end" } },
        ],
      },
    },
  },
  {
    id: "core:oren_dialogue",
    npcId: "core:oren",
    roots: { default: "greet" },
    nodes: {
      greet: {
        id: "greet",
        text: "Oren stands at the mill race, watching the still wheel. \"My sister sent you, didn't she? She's always sending people.\"",
        options: [
          { id: "wheel", text: "What stopped the wheel?", next: "wheel" },
          { id: "ledger", text: "Do you know where the ledger is?", next: "ledger" },
          { id: "bye", text: "Just looking at the mill.", action: { type: "end" } },
        ],
      },
      wheel: {
        id: "wheel",
        text: '"It jammed the same night the crypt opened. I went up to see. There was a man with a lantern and three others. They didn\'t look like locals." He lowers his voice. "One of them carried a ledger."',
        options: [{ id: "back", text: "Which direction?", next: "ledger" }],
      },
      ledger: {
        id: "ledger",
        text: "\"East, into the hill. If you find it, give it to Hessa. She'll not thank me for it, but she'll need it.\"",
        options: [{ id: "back", text: "I'll look.", next: "greet" }],
      },
    },
  },
  {
    id: "core:wren_dialogue",
    npcId: "core:wren",
    roots: { default: "greet" },
    nodes: {
      greet: {
        id: "greet",
        text: 'Wren watches the charcoal fire without turning. "You walk loudly. That is not always bad. Loud things distract other loud things."',
        options: [
          { id: "crypt", text: "What do you know about the crypt?", next: "crypt" },
          { id: "woods", text: "What are you listening for?", next: "woods" },
          { id: "bye", text: "I'll leave you to it.", action: { type: "end" } },
        ],
      },
      crypt: {
        id: "crypt",
        text: '"Old stone under new greed. The men from the south opened a door they cannot close. If you go in, keep to the left wall. The right wall listens."',
        options: [{ id: "back", text: "I'll remember.", next: "greet" }],
      },
      woods: {
        id: "woods",
        text: '"The wood is quieter than it was. Even the owls have moved. When the small things leave, the large things are already here."',
        options: [{ id: "back", text: "What large things?", next: "greet" }],
      },
    },
  },
  {
    id: "core:sable_dialogue",
    npcId: "core:sable",
    roots: { default: "greet" },
    nodes: {
      greet: {
        id: "greet",
        text: "\"Road's been long and the mule's been patient. If you need something practical, I have it. If you need a story, those are cheaper.\"",
        options: [
          {
            id: "shop",
            text: "Show me what you have.",
            action: { type: "open_shop", shopId: "core:traveling_market" },
          },
          { id: "news", text: "What have you heard on the road?", next: "news" },
          { id: "bye", text: "Safe roads to you.", action: { type: "end" } },
        ],
      },
      news: {
        id: "news",
        text: '"Not much worth carrying. A few villages are buying lamp oil like winter is coming early. And there are lights in the hills that don\'t belong to any shepherd."',
        options: [{ id: "back", text: "I'll keep my eyes open.", next: "greet" }],
      },
    },
  },
];

export function getDialogueDefinition(id: string): DialogueDefinition | undefined {
  return DIALOGUES.find((dialogue) => dialogue.id === id);
}

export const SHOPS: ShopDefinition[] = [
  {
    id: "core:redford_market",
    name: "Bryn's Stall",
    merchantNpcId: "core:bryn",
    description: "Practical kit, lamp oil, and a few things that fell off a wagon.",
    buyMultiplier: 1,
    sellMultiplier: 0.5,
    stock: [
      { itemId: "core:healing_potion", quantity: 3 },
      { itemId: "core:torch", quantity: 8 },
      { itemId: "core:rope", quantity: 4 },
      { itemId: "core:rations", quantity: 10 },
      { itemId: "core:dagger", quantity: 2 },
      { itemId: "core:leather_armor", quantity: 2 },
      { itemId: "core:longsword", quantity: 1 },
      { itemId: "core:iron_key", quantity: 1 },
    ],
  },
  {
    id: "core:traveling_market",
    name: "Sable's Mule Cart",
    merchantNpcId: "core:sable",
    description: "A mule cart of practical goods, road dust, and one very determined fold-out counter.",
    buyMultiplier: 1,
    sellMultiplier: 0.5,
    stock: [
      { itemId: "core:torch", quantity: 6 },
      { itemId: "core:rope", quantity: 2 },
      { itemId: "core:rations", quantity: 8 },
      { itemId: "core:healing_potion", quantity: 1 },
      { itemId: "core:dagger", quantity: 1 },
      { itemId: "core:leather_armor", quantity: 1 },
    ],
  },
];

export function getShopDefinition(id: string): ShopDefinition | undefined {
  return SHOPS.find((shop) => shop.id === id);
}

export const QUESTS: QuestTemplate[] = [
  {
    id: "core:the_stopped_mill",
    title: "The Mill That Stopped",
    summary:
      "Hessa Vale's mill workers vanished after the old crypt was opened. Find the mill ledger and bring it back to her.",
    giverNpcId: "core:hessa",
    turnInNpcId: "core:hessa",
    objectives: [
      {
        id: "reach_crypt",
        kind: "reach",
        description: "Reach the Old Mill Crypt.",
        targetId: "core:old_mill_crypt",
        required: 1,
      },
      {
        id: "find_ledger",
        kind: "interact",
        description: "Find the mill ledger in the crypt.",
        targetId: "core:crypt_ledger",
        required: 1,
      },
    ],
    rewards: {
      gold: 40,
      itemIds: [{ itemId: "core:silver_locket", quantity: 1 }],
    },
  },
  {
    id: "core:greywatch_watch",
    title: "The Greywatch Light",
    summary:
      "A watchman went to Greywatch Ruin after a beacon was lit and did not return. Captain Maud wants answers, quietly.",
    giverNpcId: "core:maud",
    turnInNpcId: "core:maud",
    objectives: [
      {
        id: "reach_greywatch",
        kind: "reach",
        description: "Reach Greywatch Ruin.",
        targetId: "core:greywatch_ruin",
        required: 1,
      },
    ],
    rewards: { gold: 25, itemIds: [] },
  },
];

export function getQuestTemplate(id: string): QuestTemplate | undefined {
  return QUESTS.find((quest) => quest.id === id);
}
