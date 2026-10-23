import type { HandcraftedWorldPack } from "@iwakura/contracts";

const WIDTH = 28;
const HEIGHT = 20;

const SYMBOLS = {
  ocean: "~",
  coast: "-",
  beach: "b",
  grassland: ".",
  forest: "f",
  hills: "^",
  mountains: "M",
  swamp: "s",
  desert: "d",
  lake: "w",
  river: "=",
  road: "r",
} as const;

type SymbolKey = keyof typeof SYMBOLS;

const TOWN = { col: 13, row: 10 };
const VILLAGE = { col: 10, row: 13 };
const DUNGEON = { col: 21, row: 6 };
const RUIN = { col: 18, row: 13 };
const SHRINE = { col: 6, row: 7 };

function buildRows(): string[] {
  const grid: SymbolKey[][] = Array.from({ length: HEIGHT }, () =>
    Array.from({ length: WIDTH }, () => "ocean" as SymbolKey),
  );
  const set = (col: number, row: number, symbol: SymbolKey) => {
    if (col >= 0 && col < WIDTH && row >= 0 && row < HEIGHT) grid[row]![col] = symbol;
  };
  const get = (col: number, row: number): SymbolKey | null => {
    if (col < 0 || col >= WIDTH || row < 0 || row >= HEIGHT) return null;
    return grid[row]![col] ?? null;
  };

  // A hand-shaped coastal valley.
  for (let row = 1; row < HEIGHT - 1; row += 1) {
    for (let col = 1; col < WIDTH - 1; col += 1) {
      const nx = (col - 14) / 10.5;
      const ny = (row - 10) / 7.2;
      const wobble = Math.sin(col * 0.55) * 0.04 + Math.cos(row * 0.8) * 0.03;
      if (nx * nx + ny * ny + wobble <= 1) set(col, row, "grassland");
    }
  }

  // Shallow water and beaches.
  for (let row = 1; row < HEIGHT - 1; row += 1) {
    for (let col = 1; col < WIDTH - 1; col += 1) {
      if (get(col, row) !== "ocean") continue;
      const touchesLand = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
      ].some(([dx, dy]) => {
        const neighbor = get(col + dx!, row + dy!);
        return neighbor !== null && neighbor !== "ocean" && neighbor !== "coast";
      });
      if (touchesLand) set(col, row, "coast");
    }
  }

  for (let row = 0; row < HEIGHT; row += 1) {
    for (let col = 0; col < WIDTH; col += 1) {
      if (get(col, row) !== "grassland") continue;
      const touchesWater = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const neighbor = get(col + dx!, row + dy!);
        return neighbor === "ocean" || neighbor === "coast";
      });
      if (touchesWater) set(col, row, "beach");
    }
  }

  // The western wood.
  for (let row = 5; row <= 15; row += 1) {
    for (let col = 4; col <= 12; col += 1) {
      if (get(col, row) === "grassland" || get(col, row) === "beach") {
        const edge = Math.sin(col * 0.9) + Math.cos(row * 0.7) > -0.6;
        if (edge) set(col, row, "forest");
      }
    }
  }

  // The eastern hills and the Greywatch peaks.
  for (let row = 4; row <= 12; row += 1) {
    for (let col = 17; col <= 24; col += 1) {
      if (get(col, row) === "grassland") set(col, row, "hills");
    }
  }
  for (let row = 5; row <= 8; row += 1) {
    for (let col = 19; col <= 23; col += 1) {
      if (get(col, row) === "hills") set(col, row, "mountains");
    }
  }

  // A river from the eastern peaks to the western bay.
  // Horizontal and vertical offset steps keep every river hex adjacent;
  // diagonals in odd-r offset space can skip a hex.
  const riverPath = [
    { col: 17, row: 5 },
    { col: 16, row: 5 },
    { col: 15, row: 5 },
    { col: 15, row: 6 },
    { col: 15, row: 7 },
    { col: 15, row: 8 },
    { col: 15, row: 9 },
    { col: 15, row: 10 },
    { col: 15, row: 11 },
    { col: 15, row: 12 },
    { col: 14, row: 12 },
    { col: 13, row: 12 },
    { col: 12, row: 12 },
    { col: 12, row: 13 },
    { col: 12, row: 14 },
    { col: 12, row: 15 },
    { col: 11, row: 15 },
    { col: 10, row: 15 },
    { col: 9, row: 15 },
    { col: 9, row: 16 },
    { col: 9, row: 17 },
  ];
  for (const point of riverPath) {
    const current = get(point.col, point.row);
    if (current && current !== "ocean" && current !== "coast" && current !== "mountains") {
      set(point.col, point.row, "river");
    }
  }

  for (const point of [TOWN, VILLAGE, RUIN, SHRINE]) {
    set(point.col, point.row, "grassland");
  }
  const dungeonGround = get(DUNGEON.col, DUNGEON.row);
  if (dungeonGround === "ocean" || dungeonGround === "coast" || dungeonGround === "beach") {
    set(DUNGEON.col, DUNGEON.row, "hills");
  }

  return grid.map((row) => row.map((symbol) => SYMBOLS[symbol]).join(""));
}

const rows = buildRows();

export const HANDCRAFTED_WORLDS: HandcraftedWorldPack[] = [
  {
    id: "core:redford_reach",
    name: "Redford Reach",
    description:
      "A green river valley between the western wood and the Greywatch hills. Redford keeps the ford, Millbrook keeps the mill, and something under the old mill keeps the road quiet after dark.",
    width: WIDTH,
    height: HEIGHT,
    rows,
    pois: [
      {
        id: "core:redford",
        kind: "town",
        name: "Redford",
        col: 13,
        row: 10,
        description: "A market town on the river, built around a stone ford that predates the current walls.",
      },
      {
        id: "core:millbrook",
        kind: "village",
        name: "Millbrook",
        col: 10,
        row: 13,
        description:
          "A village of millers and charcoal burners. The mill wheel has not turned in three days.",
      },
      {
        id: "core:old_mill_crypt",
        kind: "dungeon",
        name: "The Old Mill Crypt",
        col: 21,
        row: 6,
        description: "The hill above the mill is hollow. Someone has reopened the old undercroft.",
      },
      {
        id: "core:greywatch_ruin",
        kind: "ruin",
        name: "Greywatch Ruin",
        col: 18,
        row: 13,
        description: "A collapsed watchtower overlooking the southern road.",
      },
      {
        id: "core:quiet_ford_shrine",
        kind: "shrine",
        name: "Shrine of the Quiet Ford",
        col: 6,
        row: 7,
        description: "A mossy roadside shrine. Travellers leave coins and quiet vows.",
      },
    ],
    roads: [],
  },
];

export function getHandcraftedWorldPack(id: string): HandcraftedWorldPack | undefined {
  return HANDCRAFTED_WORLDS.find((pack) => pack.id === id);
}
