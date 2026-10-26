import type { AppearancePalette } from "@iwakura/content";

export type ActorFacing = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type ActorPose =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "cast"
  | "guard"
  | "hurt"
  | "down"
  | "talk"
  | "alert"
  | "victory";

export type ActorBody = "human" | "dwarf" | "elf" | "wolf" | "shade";

export type ActorArchetype =
  | "fighter"
  | "rogue"
  | "wizard"
  | "guard"
  | "merchant"
  | "clergy"
  | "fieldhand"
  | "outlaw"
  | "civilian"
  | "bandit"
  | "wolf"
  | "shade";

export type ActorWeapon =
  | "sword"
  | "dagger"
  | "staff"
  | "spear"
  | "axe"
  | "pitchfork"
  | "bite"
  | "spectral"
  | "none";

export type ActorOffhand = "shield" | "dagger" | "none";

export interface ActorAppearanceInput {
  id: string;
  name?: string;
  palette?: string;
  seed?: string;
  ancestryId?: string;
  classId?: string;
  role?: string;
  archetype?: string;
  sigil?: string;
  mainHand?: string;
  offHand?: string;
  tags?: readonly string[];
  enemyId?: string;
}

export interface ActorAppearance {
  seed: number;
  body: ActorBody;
  archetype: ActorArchetype;
  palette: AppearancePalette;
  weapon: ActorWeapon;
  offhand: ActorOffhand;
  hood: boolean;
  helmet: boolean;
  beard: boolean;
  cape: boolean;
  hairStyle: number;
  scale: number;
  sigil: string;
}

export interface ActorPresentation {
  active?: boolean;
  selected?: boolean;
  conditions?: readonly string[];
  defeated?: boolean;
  hpRatio?: number;
  aggro?: boolean;
  talking?: boolean;
  team?: "friendly" | "enemy" | "neutral";
}

export type ActorVisualCueKind = "attack" | "cast" | "guard" | "hurt" | "death" | "victory";

export interface ActorVisualCue {
  nonce: number;
  actorId: string;
  kind: ActorVisualCueKind;
  targetId?: string;
  damage?: number;
}

export interface PartyActorStatus {
  active?: boolean;
  defeated?: boolean;
  hpRatio?: number;
  conditions?: readonly string[];
}
