export interface AppearancePalette {
  id: string;
  name: string;
  cloak: string;
  trim: string;
  skin: string;
  ink: string;
  glow: string;
}

export const APPEARANCE_PALETTES: AppearancePalette[] = [
  {
    id: "verdant",
    name: "Verdant",
    cloak: "#3f5538",
    trim: "#c9a35a",
    skin: "#c9a07a",
    ink: "#11100c",
    glow: "#9fbf7a",
  },
  {
    id: "ember",
    name: "Ember",
    cloak: "#6e3a2f",
    trim: "#d49a5c",
    skin: "#b98262",
    ink: "#12100d",
    glow: "#d9794a",
  },
  {
    id: "frost",
    name: "Frost",
    cloak: "#3d5563",
    trim: "#b9cbd0",
    skin: "#c7a98f",
    ink: "#0e1114",
    glow: "#8fb5c6",
  },
  {
    id: "ink",
    name: "Ink",
    cloak: "#2a2a36",
    trim: "#9a8f7a",
    skin: "#8d6e5a",
    ink: "#08080b",
    glow: "#8d84b8",
  },
  {
    id: "gold",
    name: "Gilded",
    cloak: "#6b5428",
    trim: "#e8c987",
    skin: "#c9a07a",
    ink: "#100e0b",
    glow: "#e8c987",
  },
  {
    id: "moss",
    name: "Moss",
    cloak: "#4b5a3f",
    trim: "#a8b57a",
    skin: "#b98f6e",
    ink: "#11100d",
    glow: "#a8b57a",
  },
];

export const SIGIL_IDS = ["hex", "flame", "leaf", "eye", "sword", "moon"] as const;
export type SigilId = (typeof SIGIL_IDS)[number];

export function getPalette(id: string): AppearancePalette {
  return APPEARANCE_PALETTES.find((palette) => palette.id === id) ?? APPEARANCE_PALETTES[0]!;
}
