export interface TerrainDefinition {
  id: string;
  name: string;
  description: string;
  /** RGB integer used by PixiJS. */
  color: number;
  /** Movement cost on the world map. Null means impassable. */
  movementCost: number | null;
  water: boolean;
}

export const TERRAINS: TerrainDefinition[] = [
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep water. No crossing without a ship.",
    color: 0x182a38,
    movementCost: null,
    water: true,
  },
  {
    id: "coast",
    name: "Coastal Water",
    description: "Shallow water and breaking waves.",
    color: 0x27485a,
    movementCost: null,
    water: true,
  },
  {
    id: "lake",
    name: "Lake",
    description: "Fresh water. Rivers often end here.",
    color: 0x24465e,
    movementCost: null,
    water: true,
  },
  {
    id: "beach",
    name: "Beach",
    description: "Sand and shingle at the water's edge.",
    color: 0xa89a6a,
    movementCost: 1,
    water: false,
  },
  {
    id: "grassland",
    name: "Grassland",
    description: "Open ground. Easy going and easy to watch.",
    color: 0x6f7d4a,
    movementCost: 1,
    water: false,
  },
  {
    id: "steppe",
    name: "Steppe",
    description: "Dry grass and wind. Sparse cover.",
    color: 0x8a8650,
    movementCost: 1,
    water: false,
  },
  {
    id: "forest",
    name: "Forest",
    description: "Dense timber. Slow travel and good cover.",
    color: 0x3f5538,
    movementCost: 2,
    water: false,
  },
  {
    id: "hills",
    name: "Hills",
    description: "Broken ground. Good vantage, poor footing.",
    color: 0x7a6a4a,
    movementCost: 3,
    water: false,
  },
  {
    id: "mountains",
    name: "Mountains",
    description: "High passes and bare stone. Slow and exposed.",
    color: 0x6b655d,
    movementCost: 8,
    water: false,
  },
  {
    id: "swamp",
    name: "Swamp",
    description: "Standing water and reeds. Every step costs.",
    color: 0x4b5a3f,
    movementCost: 4,
    water: false,
  },
  {
    id: "desert",
    name: "Desert",
    description: "Sun, sand, and little shelter.",
    color: 0xb49a63,
    movementCost: 2,
    water: false,
  },
  {
    id: "tundra",
    name: "Tundra",
    description: "Cold, hard ground under a pale sky.",
    color: 0x8a8f7a,
    movementCost: 2,
    water: false,
  },
  {
    id: "snow",
    name: "Snowfield",
    description: "Deep snow and killing wind.",
    color: 0xc9d0cd,
    movementCost: 4,
    water: false,
  },
];

const BY_ID = new Map(TERRAINS.map((terrain) => [terrain.id, terrain]));

export function getTerrain(id: string): TerrainDefinition {
  return BY_ID.get(id) ?? TERRAINS[4]!;
}

export function isWaterTerrain(id: string): boolean {
  return getTerrain(id).water;
}

export function terrainCssColor(id: string): string {
  return `#${getTerrain(id).color.toString(16).padStart(6, "0")}`;
}

export function terrainMovementCost(id: string): number | null {
  return getTerrain(id).movementCost;
}
