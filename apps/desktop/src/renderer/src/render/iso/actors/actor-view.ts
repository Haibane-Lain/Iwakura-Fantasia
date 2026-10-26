import { Container, Graphics, Text } from "pixi.js";
import type { GraphicsQuality } from "../weather";
import {
  type ActorActionKind,
  type ActorActionState,
  actionDuration,
  clamp01,
  easeOutCubic,
  poseForState,
  pulse,
} from "./actor-animation";
import { facingIsBack, facingIsLeft, facingIsSide, resolveActorAppearance } from "./actor-appearance";
import {
  type ActorRigParts,
  type BeastParts,
  createActorRig,
  type HumanoidParts,
  type SpiritParts,
} from "./actor-rig";
import type {
  ActorAppearance,
  ActorAppearanceInput,
  ActorFacing,
  ActorPose,
  ActorPresentation,
  ActorVisualCueKind,
} from "./actor-types";

function parseColor(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strokeArc(
  graphics: Graphics,
  cx: number,
  cy: number,
  radius: number,
  start: number,
  end: number,
  color: number,
  width: number,
  alpha: number,
): void {
  const steps = 14;
  graphics.moveTo(cx + Math.cos(start) * radius, cy + Math.sin(start) * radius);
  for (let index = 1; index <= steps; index += 1) {
    const angle = start + ((end - start) * index) / steps;
    graphics.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  graphics.stroke({ color, width, alpha });
}

const STATUS_COLORS: Record<string, number> = {
  poison: 0x8faf62,
  poisoned: 0x8faf62,
  burning: 0xd77a3f,
  burn: 0xd77a3f,
  bleeding: 0xa94d4a,
  bleed: 0xa94d4a,
  stunned: 0xe2c982,
  stun: 0xe2c982,
};

/**
 * A procedural, layered actor view. The engine remains authoritative; this
 * class only turns stable presentation state into movement and combat poses.
 */
export class ActorView {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly ring = new Graphics();
  private readonly body: Container;
  private readonly fx = new Graphics();
  private readonly healthBar = new Graphics();
  private readonly damageLabel = new Text({
    text: "",
    style: {
      fontFamily: "Palatino Linotype, Georgia, serif",
      fontSize: 13,
      fontWeight: "700",
      fill: 0xffe0a3,
      stroke: { color: 0x080706, width: 3 },
    },
  });
  private damageRemaining = 0;
  private damageDuration = 1;
  private readonly parts: ActorRigParts;
  private readonly appearance: ActorAppearance;
  private readonly phase: number;
  private presentation: ActorPresentation = {};
  private action: ActorActionState | null = null;
  private facing: ActorFacing = "s";
  private speed = 0;
  private targetSpeed = 0;
  private elapsed = 0;
  private gait = 0;
  private defeatedAt: number | null = null;

  constructor(appearanceInput: ActorAppearanceInput, facing: ActorFacing = "s") {
    this.appearance = resolveActorAppearance(appearanceInput);
    this.facing = facing;
    this.phase = ((this.appearance.seed % 1000) / 1000) * Math.PI * 2;
    this.parts = createActorRig(this.appearance);
    this.body = this.parts.body;
    this.body.addChild(this.fx);

    this.damageLabel.anchor.set(0.5);
    this.damageLabel.visible = false;
    this.container.addChild(this.shadow, this.ring, this.body, this.healthBar, this.damageLabel);
    this.drawShadow();
    this.update(0, false, "balanced");
  }

  setPosition(x: number, y: number): void {
    this.container.position.set(x, y);
  }

  setMotion(speed: number, facing?: ActorFacing): void {
    this.targetSpeed = Math.max(0, speed);
    if (facing) this.facing = facing;
  }

  setFacing(facing: ActorFacing): void {
    this.facing = facing;
  }

  setPresentation(next: ActorPresentation): void {
    const wasDefeated = this.presentation.defeated ?? false;
    const defeated = next.defeated ?? false;
    if (defeated && !wasDefeated) {
      this.defeatedAt = this.elapsed;
      this.action = null;
    } else if (!defeated) {
      this.defeatedAt = null;
    }
    this.presentation = { ...next };
  }

  get isDefeated(): boolean {
    return this.presentation.defeated ?? false;
  }

  get currentFacing(): ActorFacing {
    return this.facing;
  }

  get labelOffsetY(): number {
    const base = this.appearance.body === "wolf" ? -34 : this.appearance.body === "shade" ? -44 : -42;
    return base * this.appearance.scale;
  }

  get footprintRadius(): number {
    return this.appearance.body === "wolf" ? 15 : this.appearance.body === "shade" ? 11 : 11;
  }

  showDamage(amount: number): void {
    if (amount <= 0 || this.presentation.defeated) return;
    this.damageLabel.text = `-${Math.round(amount)}`;
    this.damageRemaining = 1;
    this.damageDuration = 1;
    this.damageLabel.visible = true;
    this.damageLabel.alpha = 1;
  }

  playCue(kind: ActorVisualCueKind, facing?: ActorFacing): void {
    if (facing) this.facing = facing;
    if (kind === "death") {
      if (!this.presentation.defeated) {
        this.presentation = { ...this.presentation, defeated: true };
        this.defeatedAt = this.elapsed;
      }
      this.action = null;
      return;
    }
    if (this.presentation.defeated) return;
    if (kind === "hurt") {
      this.startAction("hurt");
      return;
    }
    this.startAction(kind);
  }

  update(deltaMS: number, reduceMotion: boolean, quality: GraphicsQuality): void {
    const dt = Math.max(0, deltaMS) / 1000;
    this.elapsed += dt;
    const smoothing = 1 - Math.exp(-dt * 11);
    this.speed += (this.targetSpeed - this.speed) * smoothing;
    if (this.speed < 0.4) this.speed = 0;

    if (this.action) {
      this.action.remainingMS -= deltaMS;
      if (this.action.remainingMS <= 0) this.action = null;
    }

    const prone = this.presentation.conditions?.some((condition) =>
      condition.toLowerCase().includes("prone"),
    );
    const pose =
      prone && !this.presentation.defeated
        ? "down"
        : poseForState({
            presentation: this.presentation,
            action: this.action,
            speed: this.speed,
          });

    if (pose === "walk" || pose === "run") {
      this.gait += dt * (pose === "run" ? 12 : 7.2);
    }

    const actionProgress = this.action ? clamp01(1 - this.action.remainingMS / this.action.durationMS) : 0;

    this.body.position.set(0, 0);
    this.body.rotation = 0;
    this.body.alpha = 1;
    this.fx.clear();
    this.ring.clear();
    this.healthBar.clear();
    this.drawRing();
    this.drawHealthBar();

    const mirror = facingIsLeft(this.facing) ? -1 : 1;
    const side = facingIsSide(this.facing) ? 0.9 : 1;
    const baseScale = this.appearance.scale * mirror * side;

    let scaleY = this.appearance.scale;
    let bodyX = 0;
    let bodyY = 0;
    let bodyRotation = 0;
    let alpha = 1;

    if (this.parts.kind === "humanoid") {
      const result = this.animateHumanoid(
        this.parts,
        pose,
        actionProgress,
        reduceMotion,
        quality,
        this.gait,
        this.elapsed,
        this.phase,
      );
      bodyX = result.x;
      bodyY = result.y;
      bodyRotation = result.rotation;
      scaleY *= result.scaleY;
      alpha = result.alpha;
    } else if (this.parts.kind === "beast") {
      const result = this.animateBeast(
        this.parts,
        pose,
        actionProgress,
        reduceMotion,
        quality,
        this.gait,
        this.elapsed,
        this.phase,
      );
      bodyX = result.x;
      bodyY = result.y;
      bodyRotation = result.rotation;
      scaleY *= result.scaleY;
      alpha = result.alpha;
    } else {
      const result = this.animateSpirit(
        this.parts,
        pose,
        actionProgress,
        reduceMotion,
        quality,
        this.gait,
        this.elapsed,
        this.phase,
      );
      bodyX = result.x;
      bodyY = result.y;
      bodyRotation = result.rotation;
      scaleY *= result.scaleY;
      alpha = result.alpha;
    }

    if (this.presentation.defeated && this.defeatedAt !== null) {
      const fade = clamp01((this.elapsed - this.defeatedAt) / 2.8);
      alpha *= 1 - fade * 0.6;
      this.shadow.alpha = 0.42 * (1 - fade * 0.55);
    } else {
      this.shadow.alpha = 0.42;
    }

    this.body.position.set(bodyX, bodyY);
    this.body.rotation = bodyRotation;
    this.body.scale.set(baseScale, scaleY);
    this.body.alpha = alpha;
    this.drawActorFx(pose, actionProgress, reduceMotion, quality, this.parts.kind);

    if (this.damageRemaining > 0) {
      this.damageRemaining = Math.max(0, this.damageRemaining - dt / this.damageDuration);
      const progress = 1 - this.damageRemaining;
      this.damageLabel.position.set(0, -48 - progress * 16);
      this.damageLabel.alpha = this.damageRemaining;
      this.damageLabel.scale.set(1 + (1 - this.damageRemaining) * 0.08);
      this.damageLabel.visible = true;
    } else {
      this.damageLabel.visible = false;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private startAction(kind: ActorActionKind): void {
    const durationMS = actionDuration(kind);
    this.action = { kind, durationMS, remainingMS: durationMS };
  }

  private drawShadow(): void {
    const radius = this.appearance.body === "wolf" ? 14 : 10.5;
    this.shadow.ellipse(0, 1, radius, radius * 0.38).fill({ color: 0x080706, alpha: 0.42 });
  }

  private drawHealthBar(): void {
    const ratio = this.presentation.hpRatio;
    if (ratio === undefined || this.presentation.defeated) return;
    const width = this.appearance.body === "wolf" ? 28 : 24;
    const y = 8;
    const teamColor = this.presentation.team === "enemy" ? 0xb45a4f : 0x9fb37a;
    this.healthBar.roundRect(-width / 2 - 1, y - 1, width + 2, 5, 2).fill({ color: 0x080706, alpha: 0.62 });
    if (ratio > 0) {
      this.healthBar
        .roundRect(-width / 2, y, width * clamp01(ratio), 3, 1.5)
        .fill({ color: teamColor, alpha: 0.95 });
    }
    this.healthBar
      .roundRect(-width / 2 - 1, y - 1, width + 2, 5, 2)
      .stroke({ color: 0x080706, width: 0.7, alpha: 0.55 });
  }

  private drawRing(): void {
    const presentation = this.presentation;
    if (presentation.defeated) return;
    const enemy = presentation.team === "enemy";
    const friendly = presentation.team === "friendly";
    const active = presentation.active ?? false;
    const selected = presentation.selected ?? false;
    const baseColor = enemy ? 0xb45a4f : friendly ? 0x9fb37a : 0xe8c987;
    const radius = this.appearance.body === "wolf" ? 16 : 11.5;
    const squash = this.appearance.body === "wolf" ? 0.42 : 0.4;
    const activePulse = pulse(this.elapsed * 3.5);

    if (active) {
      this.ring
        .ellipse(0, 0, radius + activePulse * 2.4, (radius + activePulse * 2.4) * squash)
        .fill({ color: 0xe8c987, alpha: 0.05 })
        .stroke({ color: 0xe8c987, width: 2.1, alpha: 0.95 });
      this.ring
        .ellipse(0, 0, radius + 3.2 + activePulse * 2, (radius + 3.2 + activePulse * 2) * squash)
        .stroke({ color: 0xf7e7b4, width: 0.8, alpha: 0.35 });
      return;
    }
    if (selected) {
      this.ring
        .ellipse(0, 0, radius + 1.5, (radius + 1.5) * squash)
        .fill({ color: 0xd67e72, alpha: 0.16 })
        .stroke({ color: 0xff7a62, width: 3, alpha: 1 });
      this.ring
        .ellipse(0, 0, radius + 4.4, (radius + 4.4) * squash)
        .stroke({ color: 0xffc1ac, width: 0.9, alpha: 0.7 });
      return;
    }
    this.ring
      .ellipse(0, 0, radius, radius * squash)
      .stroke({ color: baseColor, width: enemy ? 1.2 : 0.9, alpha: enemy ? 0.4 : 0.25 });
  }

  private animateHumanoid(
    parts: HumanoidParts,
    pose: ActorPose,
    actionProgress: number,
    reduceMotion: boolean,
    quality: GraphicsQuality,
    gait: number,
    elapsed: number,
    phase: number,
  ): { x: number; y: number; rotation: number; scaleY: number; alpha: number } {
    const back = facingIsBack(this.facing);
    const side = facingIsSide(this.facing);
    parts.face.visible = !back && !side;
    parts.faceSide.visible = !back && side;
    parts.backHead.visible = back;
    parts.sigil.visible = !back;
    parts.accessories.visible = !back;
    if (parts.beard) parts.beard.visible = !back;
    const diagonal = this.facing !== "n" && this.facing !== "s";
    parts.head.position.set(diagonal ? 0.6 : 0, -31);
    parts.head.rotation = 0;
    parts.torso.rotation = 0;
    parts.legLeft.rotation = 0;
    parts.legRight.rotation = 0;
    parts.armBack.rotation = 0.06;
    parts.armFront.rotation = -0.04;
    parts.weapon.rotation = parts.weaponRestRotation;
    parts.cloak.rotation = 0;
    parts.cloak.alpha = back ? 1 : 0.94;
    parts.cloak.visible = this.appearance.cape;

    const breath = Math.sin(elapsed * 2.3 + phase);
    const stride = Math.sin(gait);
    const strideCos = Math.cos(gait);
    let x = 0;
    let y = breath * 0.4;
    let rotation = 0;
    let scaleY = 1;
    let alpha = 1;

    switch (pose) {
      case "walk":
        parts.legLeft.rotation = stride * 0.45;
        parts.legRight.rotation = -stride * 0.45;
        parts.armFront.rotation = -stride * 0.32;
        parts.armBack.rotation = stride * 0.28;
        y = -Math.abs(strideCos) * 0.75;
        parts.cloak.rotation = -0.05 + stride * 0.05;
        break;
      case "run":
        parts.legLeft.rotation = stride * 0.7;
        parts.legRight.rotation = -stride * 0.7;
        parts.armFront.rotation = -stride * 0.52;
        parts.armBack.rotation = stride * 0.4;
        y = -Math.abs(strideCos) * 1.2;
        rotation = -0.065;
        parts.cloak.rotation = -0.16 - Math.abs(stride) * 0.06;
        break;
      case "alert":
        y = 0.4 + breath * 0.15;
        parts.armFront.rotation = -0.36;
        parts.armBack.rotation = -0.12;
        parts.legLeft.rotation = -0.08;
        parts.legRight.rotation = 0.08;
        parts.cloak.rotation = -0.04;
        break;
      case "talk":
        parts.head.rotation = breath * 0.05;
        parts.armFront.rotation = -0.5 + Math.sin(elapsed * 2.8 + phase) * 0.15;
        parts.armBack.rotation = 0.12;
        y = breath * 0.32;
        break;
      case "attack": {
        const windup = actionProgress < 0.28 ? actionProgress / 0.28 : 1;
        const strike = actionProgress >= 0.28 ? easeOutCubic((actionProgress - 0.28) / 0.72) : 0;
        parts.armFront.rotation = 0.04 - windup * 1.45 + strike * 2.6;
        parts.armBack.rotation = 0.16 + windup * 0.35 - strike * 0.55;
        parts.weapon.rotation = parts.weaponRestRotation - windup * 0.38 + strike * 0.52;
        parts.legLeft.rotation = -0.1;
        parts.legRight.rotation = 0.16;
        x = -windup * 1.2 + strike * 3.2;
        y = -strike * 0.4;
        rotation = -0.03 + strike * 0.12;
        parts.cloak.rotation = -0.08 - strike * 0.18;
        break;
      }
      case "cast":
        parts.armFront.rotation = -1.52;
        parts.armBack.rotation = -0.88;
        parts.weapon.rotation = parts.weaponRestRotation - 0.7;
        parts.legLeft.rotation = -0.08;
        parts.legRight.rotation = 0.08;
        y = -0.7 + Math.sin(actionProgress * Math.PI) * 0.4;
        parts.cloak.rotation = -0.03;
        break;
      case "guard":
        parts.armBack.rotation = -1.1;
        parts.armFront.rotation = 0.22;
        parts.legLeft.rotation = -0.16;
        parts.legRight.rotation = 0.16;
        y = 0.9;
        scaleY = 0.96;
        break;
      case "hurt": {
        const recoil = Math.sin(actionProgress * Math.PI);
        x = recoil * 3;
        y = recoil * 0.8;
        rotation = -recoil * 0.08;
        alpha = 0.82;
        parts.armFront.rotation = -recoil * 0.55;
        parts.armBack.rotation = recoil * 0.35;
        parts.head.rotation = -recoil * 0.1;
        break;
      }
      case "victory": {
        const lift = easeOutCubic(actionProgress);
        parts.armFront.rotation = -0.1 - lift * 2.3;
        parts.armBack.rotation = -0.1 - lift * 0.5;
        y = -Math.abs(Math.sin(actionProgress * Math.PI * 3)) * lift;
        parts.head.rotation = 0.05;
        break;
      }
      case "down":
        if (this.presentation.defeated) {
          y = 4.4;
          rotation = -1.02;
          scaleY = 0.56;
          parts.legLeft.rotation = -0.42;
          parts.legRight.rotation = 0.36;
          parts.armFront.rotation = 0.62;
          parts.armBack.rotation = -0.5;
          parts.head.position.y = -28.4;
          parts.cloak.rotation = 0.18;
        } else {
          y = 2.2;
          rotation = -0.18;
          scaleY = 0.74;
          parts.legLeft.rotation = -0.32;
          parts.legRight.rotation = 0.38;
          parts.armFront.rotation = 0.4;
          parts.armBack.rotation = -0.3;
          parts.head.position.y = -28.4;
          parts.cloak.rotation = 0.1;
        }
        break;
      default:
        parts.head.rotation = breath * 0.025;
        parts.armFront.rotation = -0.04 + breath * 0.025;
        parts.armBack.rotation = 0.06 - breath * 0.02;
        parts.cloak.rotation = breath * 0.018;
        break;
    }

    if (reduceMotion) {
      y = pose === "down" ? y : 0;
      if (pose === "idle" || pose === "walk" || pose === "run") {
        parts.legLeft.rotation = 0;
        parts.legRight.rotation = 0;
        parts.armFront.rotation = -0.04;
        parts.armBack.rotation = 0.06;
        parts.cloak.rotation = 0;
        parts.head.rotation = 0;
      }
    }
    if (quality === "low") {
      parts.cloak.visible = false;
      parts.sigil.visible = false;
    }

    this.drawActorFx(pose, actionProgress, reduceMotion, quality, "humanoid");
    return { x, y, rotation, scaleY, alpha };
  }

  private animateBeast(
    parts: BeastParts,
    pose: ActorPose,
    actionProgress: number,
    reduceMotion: boolean,
    quality: GraphicsQuality,
    gait: number,
    elapsed: number,
    phase: number,
  ): { x: number; y: number; rotation: number; scaleY: number; alpha: number } {
    const breath = Math.sin(elapsed * 2.4 + phase);
    const phases = [0, Math.PI, Math.PI, 0];
    for (const [index, leg] of parts.legs.entries()) {
      leg.rotation = 0;
      if (pose === "walk" || pose === "run") {
        leg.rotation = Math.sin(gait + (phases[index] ?? 0)) * (pose === "run" ? 0.62 : 0.4);
      }
    }
    parts.tail.rotation = Math.sin(elapsed * 2.6 + phase) * 0.22;
    parts.tail.visible = true;
    parts.head.position.set(11, -22);
    parts.head.rotation = 0;
    parts.jaw.rotation = 0;
    let x = 0;
    let y = breath * 0.28;
    let rotation = 0;
    let scaleY = 1;
    let alpha = 1;

    switch (pose) {
      case "walk":
        y = -Math.abs(Math.cos(gait)) * 0.55;
        break;
      case "run":
        y = -Math.abs(Math.cos(gait)) * 0.9;
        rotation = -0.035;
        parts.tail.rotation = -0.08 + Math.sin(elapsed * 5) * 0.12;
        break;
      case "alert":
        y = 0.5;
        parts.head.position.y = -21;
        parts.tail.rotation = -0.28;
        break;
      case "attack": {
        const lunge = Math.sin(actionProgress * Math.PI);
        x = lunge * 3.4;
        y = -lunge * 0.6;
        rotation = lunge * 0.03;
        parts.head.position.set(11 + lunge * 3.4, -22 - lunge * 0.6);
        parts.head.rotation = -lunge * 0.24;
        parts.jaw.rotation = lunge > 0.45 ? 0.34 : 0.08;
        parts.tail.rotation = -0.3;
        break;
      }
      case "hurt": {
        const recoil = Math.sin(actionProgress * Math.PI);
        x = -recoil * 3;
        alpha = 0.82;
        parts.head.rotation = recoil * 0.16;
        break;
      }
      case "down":
        y = this.presentation.defeated ? 4.6 : 2.8;
        rotation = this.presentation.defeated ? 0.52 : 0.18;
        scaleY = this.presentation.defeated ? 0.46 : 0.65;
        parts.head.position.set(10, -17);
        parts.head.rotation = -0.18;
        parts.tail.rotation = 0.35;
        break;
      case "victory":
        y = -Math.abs(Math.sin(actionProgress * Math.PI * 2)) * 1.2;
        parts.head.rotation = -0.2;
        parts.tail.rotation = 0.35;
        break;
      default:
        break;
    }

    if (reduceMotion) {
      y = pose === "down" ? y : 0;
      if (pose === "idle" || pose === "walk" || pose === "run") {
        for (const leg of parts.legs) leg.rotation = 0;
        parts.tail.rotation = 0;
        parts.head.rotation = 0;
      }
    }
    if (quality === "low") {
      parts.tail.visible = false;
    }
    this.drawActorFx(pose, actionProgress, reduceMotion, quality, "beast");
    return { x, y, rotation, scaleY, alpha };
  }

  private animateSpirit(
    parts: SpiritParts,
    pose: ActorPose,
    actionProgress: number,
    reduceMotion: boolean,
    quality: GraphicsQuality,
    gait: number,
    elapsed: number,
    phase: number,
  ): { x: number; y: number; rotation: number; scaleY: number; alpha: number } {
    const breath = Math.sin(elapsed * 2.1 + phase);
    const stride = Math.sin(gait);
    parts.head.position.set(0, -34);
    parts.head.rotation = 0;
    parts.armLeft.rotation = -0.16;
    parts.armRight.rotation = 0.16;
    parts.core.visible = true;
    parts.core.alpha = 0.72 + pulse(elapsed * 2.3, phase) * 0.28;
    for (const [index, strip] of parts.strips.entries()) {
      strip.rotation = Math.sin(elapsed * 1.4 + phase + index * 0.9) * 0.04;
    }
    let x = 0;
    let y = -1 + breath * 0.7;
    let rotation = 0;
    let scaleY = 1;
    let alpha = 1;

    switch (pose) {
      case "walk":
        y = -1.2 - Math.abs(stride) * 0.7;
        parts.armLeft.rotation = -0.3;
        parts.armRight.rotation = -0.05;
        break;
      case "run":
        y = -1.8 - Math.abs(stride) * 1.1;
        rotation = -0.035;
        parts.armLeft.rotation = -0.55;
        parts.armRight.rotation = -0.1;
        break;
      case "alert":
        parts.core.alpha = 1;
        parts.armLeft.rotation = -0.38;
        parts.armRight.rotation = 0.42;
        y = -1.4;
        break;
      case "talk":
        parts.head.rotation = breath * 0.05;
        parts.armRight.rotation = 0.4 + Math.sin(elapsed * 2.5) * 0.12;
        break;
      case "attack": {
        const lunge = Math.sin(actionProgress * Math.PI);
        x = lunge * 2.4;
        y = -1.4 - lunge * 0.8;
        parts.armRight.rotation = -0.1 - lunge * 1.2;
        parts.armLeft.rotation = 0.1 + lunge * 0.5;
        parts.core.alpha = 0.8 + lunge * 0.2;
        break;
      }
      case "cast":
        parts.armLeft.rotation = -1.1;
        parts.armRight.rotation = 1.1;
        y = -2.1;
        parts.core.alpha = 0.8 + Math.sin(actionProgress * Math.PI) * 0.2;
        break;
      case "guard":
        parts.armLeft.rotation = -0.8;
        parts.armRight.rotation = 0.5;
        y = -0.5;
        scaleY = 0.95;
        break;
      case "hurt": {
        const recoil = Math.sin(actionProgress * Math.PI);
        x = -recoil * 2.5;
        alpha = 0.68;
        parts.head.rotation = recoil * 0.08;
        break;
      }
      case "down":
        y = this.presentation.defeated ? 4.2 : 2.4;
        rotation = this.presentation.defeated ? 0.16 : 0.08;
        scaleY = this.presentation.defeated ? 0.32 : 0.72;
        parts.armLeft.rotation = 0.32;
        parts.armRight.rotation = -0.28;
        break;
      case "victory":
        y = -1.5 - Math.abs(Math.sin(actionProgress * Math.PI * 2)) * 1.2;
        parts.armLeft.rotation = -1.2;
        parts.armRight.rotation = 1.2;
        break;
      default:
        break;
    }

    if (reduceMotion) {
      y = pose === "down" ? y : -1;
      for (const strip of parts.strips) strip.rotation = 0;
      if (pose === "idle" || pose === "walk" || pose === "run") {
        parts.armLeft.rotation = -0.16;
        parts.armRight.rotation = 0.16;
      }
    }
    if (quality === "low") {
      parts.core.visible = false;
    }
    this.drawActorFx(pose, actionProgress, reduceMotion, quality, "spirit");
    return { x, y, rotation, scaleY, alpha };
  }

  private drawActorFx(
    pose: ActorPose,
    actionProgress: number,
    reduceMotion: boolean,
    quality: GraphicsQuality,
    rig: "humanoid" | "beast" | "spirit",
  ): void {
    if (quality === "low" || this.presentation.defeated) return;
    const trim = parseColor(this.appearance.palette.trim, 0xc9a35a);
    const glow = parseColor(this.appearance.palette.glow, trim);
    if (pose === "attack" && actionProgress > 0.16 && actionProgress < 0.78 && !reduceMotion) {
      const fade = Math.sin(clamp01((actionProgress - 0.16) / 0.62) * Math.PI);
      const y = rig === "beast" ? -16 : -20;
      const radius = rig === "spirit" ? 25 : 22;
      strokeArc(this.fx, 0, y, radius, -1.25, 0.55, glow, 1.8, 0.75 * fade);
      strokeArc(this.fx, 0, y, radius + 4, -1.15, 0.42, 0xf7e7b4, 0.8, 0.4 * fade);
    }
    if (pose === "cast" && !reduceMotion) {
      const fade = Math.sin(clamp01(actionProgress) * Math.PI);
      this.fx
        .ellipse(0, -2, 16 + fade * 6, 6 + fade * 2)
        .stroke({ color: glow, width: 1.4, alpha: 0.3 + fade * 0.4 });
      this.fx.circle(0, -22, 2.2 + fade * 2.6).fill({ color: glow, alpha: 0.12 + fade * 0.18 });
    }
    if (pose === "guard" && actionProgress > 0.12 && actionProgress < 0.72) {
      const fade = Math.sin(actionProgress * Math.PI);
      this.fx
        .moveTo(-5, -25)
        .lineTo(5, -27)
        .lineTo(2, -18)
        .stroke({ color: 0xf4e8c7, width: 1.2, alpha: 0.3 * fade });
    }
    if (pose === "hurt" && !reduceMotion) {
      this.fx
        .moveTo(-11, -30)
        .lineTo(-8, -33)
        .moveTo(10, -20)
        .lineTo(13, -18)
        .stroke({ color: 0xe7d8c0, width: 0.8, alpha: 0.35 * Math.sin(actionProgress * Math.PI) });
    }

    const conditions = this.presentation.conditions?.map((condition) => condition.toLowerCase()) ?? [];
    if (conditions.some((condition) => condition.includes("shield"))) {
      this.fx
        .ellipse(0, -22, 14.5, 19)
        .fill({ color: 0x86b6c4, alpha: 0.06 })
        .stroke({ color: 0x9ed4df, width: 1.1, alpha: 0.42 + pulse(this.elapsed * 2) * 0.12 });
    }
    for (const condition of conditions) {
      const statusColor = STATUS_COLORS[condition];
      if (!statusColor) continue;
      for (let index = 0; index < 3; index += 1) {
        const drift = reduceMotion ? 0 : this.elapsed * (1.1 + index * 0.2);
        const x = Math.sin(this.phase + index * 2.1 + drift) * (6 + index * 1.8);
        const y = -10 - ((drift * 8 + index * 9) % 24);
        this.fx.circle(x, y, 1.1 + index * 0.25).fill({ color: statusColor, alpha: 0.38 });
      }
    }
  }
}
