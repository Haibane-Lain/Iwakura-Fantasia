import { type Application, Container, Graphics, Sprite, Texture, TilingSprite } from "pixi.js";
import { resolveWeatherKind, type WeatherKind, type WeatherSetting } from "./weather-rules";

export type GraphicsQuality = "low" | "balanced" | "high";
export type { WeatherKind, WeatherSetting } from "./weather-rules";

interface WeatherParticle {
  sprite: Sprite;
  vx: number;
  vy: number;
  phase: number;
  sway: number;
}

function css(color: number, alpha = 1): string {
  return `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${alpha})`;
}

function canvasContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  return context;
}

function makeTexture(context: CanvasRenderingContext2D): Texture {
  const texture = Texture.from(context.canvas, true);
  texture.source.scaleMode = "linear";
  texture.source.addressMode = "repeat";
  return texture;
}

let weatherTextures: {
  rain: Texture;
  snow: Texture;
  fog: Texture;
  leaf: Texture;
  dust: Texture;
} | null = null;

function getWeatherTextures(): NonNullable<typeof weatherTextures> {
  if (weatherTextures) return weatherTextures;

  const rain = canvasContext(512, 512);
  rain.clearRect(0, 0, 512, 512);
  for (let index = 0; index < 160; index += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const length = 16 + Math.random() * 34;
    rain.globalAlpha = 0.18 + Math.random() * 0.38;
    rain.strokeStyle = css(Math.random() > 0.72 ? 0xdce8ef : 0xa9c1cd);
    rain.lineWidth = 0.7 + Math.random() * 1.2;
    rain.beginPath();
    rain.moveTo(x, y);
    rain.lineTo(x - length * 0.24, y + length);
    rain.stroke();
  }

  const snow = canvasContext(512, 512);
  snow.clearRect(0, 0, 512, 512);
  for (let index = 0; index < 130; index += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 0.8 + Math.random() * 3.2;
    const gradient = snow.createRadialGradient(x, y, 0, x, y, radius * 2.2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(0.45, "rgba(244, 249, 250, 0.5)");
    gradient.addColorStop(1, "rgba(244, 249, 250, 0)");
    snow.fillStyle = gradient;
    snow.beginPath();
    snow.arc(x, y, radius * 2.2, 0, Math.PI * 2);
    snow.fill();
  }

  const fog = canvasContext(512, 512);
  fog.clearRect(0, 0, 512, 512);
  for (let index = 0; index < 24; index += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 50 + Math.random() * 130;
    const gradient = fog.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(233, 235, 224, 0.13)");
    gradient.addColorStop(0.45, "rgba(229, 231, 220, 0.07)");
    gradient.addColorStop(1, "rgba(229, 231, 220, 0)");
    fog.fillStyle = gradient;
    fog.beginPath();
    fog.arc(x, y, radius, 0, Math.PI * 2);
    fog.fill();
  }

  const leaf = canvasContext(24, 24);
  leaf.fillStyle = "#b86b3c";
  leaf.beginPath();
  leaf.ellipse(12, 12, 3.2, 7, 0.7, 0, Math.PI * 2);
  leaf.fill();
  leaf.strokeStyle = "#6f3f25";
  leaf.lineWidth = 1;
  leaf.beginPath();
  leaf.moveTo(9, 17);
  leaf.lineTo(14, 7);
  leaf.stroke();

  const dust = canvasContext(16, 16);
  const dustGradient = dust.createRadialGradient(8, 8, 0, 8, 8, 8);
  dustGradient.addColorStop(0, "rgba(255, 247, 218, 0.95)");
  dustGradient.addColorStop(0.3, "rgba(255, 235, 183, 0.45)");
  dustGradient.addColorStop(1, "rgba(255, 235, 183, 0)");
  dust.fillStyle = dustGradient;
  dust.fillRect(0, 0, 16, 16);

  weatherTextures = {
    rain: makeTexture(rain),
    snow: makeTexture(snow),
    fog: makeTexture(fog),
    leaf: makeTexture(leaf),
    dust: makeTexture(dust),
  };
  return weatherTextures;
}

/**
 * Purely visual weather selection. It derives from clock and map, never from
 * the engine's gameplay RNG, so it cannot change a save's rules outcome.
 */
export class WeatherFx {
  readonly container = new Container();
  private readonly rainA: TilingSprite;
  private readonly rainB: TilingSprite;
  private readonly snowA: TilingSprite;
  private readonly snowB: TilingSprite;
  private readonly fogA: TilingSprite;
  private readonly fogB: TilingSprite;
  private readonly tint = new Graphics();
  private readonly flash = new Graphics();
  private readonly leaves: WeatherParticle[] = [];
  private readonly dust: WeatherParticle[] = [];
  private kind: WeatherKind = "clear";
  private quality: GraphicsQuality;
  private reduceMotion: boolean;
  private setting: WeatherSetting;
  private mapId: string;
  private hour: number;
  private seed: string;
  private indoor: boolean;
  private elapsed = 0;
  private nextFlash = 5 + Math.random() * 6;
  private tintColor = 0x000000;
  private tintAlpha = 0;

  constructor(
    private readonly app: Application,
    options: {
      setting: WeatherSetting;
      quality: GraphicsQuality;
      mapId: string;
      hour: number;
      seed: string;
      indoor: boolean;
      reduceMotion: boolean;
    },
  ) {
    this.quality = options.quality;
    this.reduceMotion = options.reduceMotion;
    this.setting = options.setting;
    this.mapId = options.mapId;
    this.hour = options.hour;
    this.seed = options.seed;
    this.indoor = options.indoor;
    const textures = getWeatherTextures();
    this.container.eventMode = "none";
    this.container.interactiveChildren = false;

    this.rainA = new TilingSprite({ texture: textures.rain, width: 1, height: 1 });
    this.rainB = new TilingSprite({ texture: textures.rain, width: 1, height: 1 });
    this.snowA = new TilingSprite({ texture: textures.snow, width: 1, height: 1 });
    this.snowB = new TilingSprite({ texture: textures.snow, width: 1, height: 1 });
    this.fogA = new TilingSprite({ texture: textures.fog, width: 1, height: 1 });
    this.fogB = new TilingSprite({ texture: textures.fog, width: 1, height: 1 });
    this.rainA.alpha = 0;
    this.rainB.alpha = 0;
    this.snowA.alpha = 0;
    this.snowB.alpha = 0;
    this.fogA.alpha = 0;
    this.fogB.alpha = 0;
    this.rainA.tileScale.set(1.25);
    this.rainB.tileScale.set(0.82);
    this.snowA.tileScale.set(1.2);
    this.snowB.tileScale.set(0.72);
    this.fogA.tileScale.set(1.8);
    this.fogB.tileScale.set(1.1);
    this.container.addChild(this.fogA, this.fogB, this.rainA, this.rainB, this.snowA, this.snowB);

    const leafTexture = textures.leaf;
    for (let index = 0; index < 34; index += 1) {
      const sprite = new Sprite(leafTexture);
      sprite.anchor.set(0.5);
      sprite.scale.set(0.35 + Math.random() * 0.5);
      sprite.alpha = 0;
      this.container.addChild(sprite);
      this.leaves.push({
        sprite,
        vx: 0.018 + Math.random() * 0.028,
        vy: 0.045 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
        sway: 8 + Math.random() * 18,
      });
    }
    for (const particle of this.leaves) {
      particle.sprite.position.set(Math.random() * 1200, Math.random() * 800);
    }
    for (let index = 0; index < 42; index += 1) {
      const sprite = new Sprite(textures.dust);
      sprite.anchor.set(0.5);
      sprite.scale.set(0.2 + Math.random() * 0.35);
      sprite.alpha = 0;
      this.container.addChild(sprite);
      this.dust.push({
        sprite,
        vx: (Math.random() - 0.5) * 0.012,
        vy: -0.008 - Math.random() * 0.014,
        phase: Math.random() * Math.PI * 2,
        sway: 4 + Math.random() * 10,
      });
    }
    for (const particle of this.dust) {
      particle.sprite.position.set(Math.random() * 1200, Math.random() * 800);
    }
    this.container.addChild(this.tint, this.flash);
    this.flash.alpha = 0;
    this.app.stage.addChild(this.container);
    this.resize();
    this.applyWeather();
  }

  setWeather(setting: WeatherSetting, mapId: string, hour: number, seed: string, indoor: boolean): void {
    this.setting = setting;
    this.mapId = mapId;
    this.hour = hour;
    this.seed = seed;
    this.indoor = indoor;
    this.applyWeather();
  }

  setQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    this.applyWeather();
  }

  private applyWeather(): void {
    this.kind = resolveWeatherKind(this.setting, this.mapId, this.hour, this.seed, this.indoor);
    const low = this.quality === "low";
    const rain = this.kind === "rain" || this.kind === "storm";
    const snow = this.kind === "snow";
    const fog = this.kind === "fog" || this.kind === "overcast" || rain;
    this.rainA.visible = rain;
    this.rainB.visible = rain;
    this.rainA.alpha = rain ? (this.kind === "storm" ? 0.62 : low ? 0.28 : 0.44) : 0;
    this.rainB.alpha = rain ? (this.kind === "storm" ? 0.32 : low ? 0.12 : 0.2) : 0;
    this.snowA.visible = snow;
    this.snowB.visible = snow;
    this.snowA.alpha = snow ? (low ? 0.3 : 0.62) : 0;
    this.snowB.alpha = snow ? (low ? 0.12 : 0.26) : 0;
    this.fogA.visible = fog;
    this.fogB.visible = fog;
    this.fogA.alpha =
      this.kind === "fog" ? (low ? 0.16 : 0.3) : this.kind === "overcast" ? 0.09 : rain ? 0.17 : 0;
    this.fogB.alpha = this.kind === "fog" ? (low ? 0.08 : 0.16) : this.kind === "overcast" ? 0.05 : 0;
    for (const particle of this.leaves) {
      const active = this.kind === "leaves" && !low && !this.reduceMotion;
      particle.sprite.visible = active;
      particle.sprite.alpha = active ? 0.86 : 0;
    }
    for (const particle of this.dust) {
      const active = this.kind === "dust" && !low && !this.reduceMotion;
      particle.sprite.visible = active;
      particle.sprite.alpha = active ? 0.7 : 0;
    }
    const tint =
      this.kind === "storm"
        ? { color: 0x273440, alpha: 0.2 }
        : this.kind === "rain"
          ? { color: 0x52646d, alpha: 0.11 }
          : this.kind === "snow"
            ? { color: 0xdde6e8, alpha: 0.08 }
            : this.kind === "fog"
              ? { color: 0xb8b9a9, alpha: 0.09 }
              : this.kind === "overcast"
                ? { color: 0x6f746d, alpha: 0.065 }
                : this.kind === "leaves"
                  ? { color: 0xb57b46, alpha: 0.035 }
                  : { color: 0x000000, alpha: 0 };
    this.tintColor = tint.color;
    this.tintAlpha = tint.alpha;
    this.applyTint();
    this.flash.alpha = 0;
    this.flash.clear();
    this.nextFlash = 5 + Math.random() * 8;
  }

  private applyTint(): void {
    this.tint
      .clear()
      .rect(0, 0, this.app.screen.width, this.app.screen.height)
      .fill({ color: this.tintColor, alpha: this.tintAlpha });
  }

  setReduceMotion(reduceMotion: boolean): void {
    this.reduceMotion = reduceMotion;
    this.applyWeather();
  }

  resize(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    for (const sprite of [this.rainA, this.rainB, this.snowA, this.snowB, this.fogA, this.fogB]) {
      sprite.width = width;
      sprite.height = height;
    }
    this.applyTint();
    this.flash.clear();
  }

  update(deltaMS: number): void {
    this.elapsed += deltaMS;
    const elapsed = this.elapsed;
    const motion = this.reduceMotion || this.quality === "low" ? 0 : 1;
    this.rainA.tilePosition.y += deltaMS * 0.92 * motion;
    this.rainA.tilePosition.x += deltaMS * 0.08 * motion;
    this.rainB.tilePosition.y += deltaMS * 0.58 * motion;
    this.rainB.tilePosition.x += deltaMS * 0.05 * motion;
    this.snowA.tilePosition.y += deltaMS * 0.022 * motion;
    this.snowA.tilePosition.x = Math.sin(elapsed * 0.00016) * 22 * motion;
    this.snowB.tilePosition.y += deltaMS * 0.035 * motion;
    this.snowB.tilePosition.x = Math.cos(elapsed * 0.00012) * 14 * motion;
    this.fogA.tilePosition.x += deltaMS * 0.004 * motion;
    this.fogA.tilePosition.y = Math.sin(elapsed * 0.00008) * 16 * motion;
    this.fogB.tilePosition.x -= deltaMS * 0.0025 * motion;
    this.fogB.tilePosition.y += deltaMS * 0.0015 * motion;

    const width = this.app.screen.width;
    const height = this.app.screen.height;
    if (!this.reduceMotion) {
      for (const particle of this.leaves) {
        if (!particle.sprite.visible) continue;
        particle.sprite.x = ((particle.sprite.x + particle.vx * deltaMS + width) % (width + 80)) - 40;
        particle.sprite.y = ((particle.sprite.y + particle.vy * deltaMS + height + 60) % (height + 80)) - 40;
        particle.sprite.rotation += deltaMS * 0.0015;
      }
      for (const particle of this.dust) {
        if (!particle.sprite.visible) continue;
        particle.sprite.x =
          particle.sprite.x +
          particle.vx * deltaMS +
          Math.sin(elapsed * 0.0004 + particle.phase) * particle.sway * 0.004;
        particle.sprite.y -= particle.vy * deltaMS;
        if (particle.sprite.y < -10) {
          particle.sprite.y = height + 10;
          particle.sprite.x = Math.random() * width;
        }
        if (particle.sprite.x < -10) particle.sprite.x = width + 10;
        if (particle.sprite.x > width + 10) particle.sprite.x = -10;
      }
      if (this.kind === "storm") {
        this.nextFlash -= deltaMS / 1000;
        if (this.nextFlash <= 0) {
          this.nextFlash = 6 + Math.random() * 9;
          this.flash.clear().rect(0, 0, width, height).fill({ color: 0xe4eef1, alpha: 0.36 });
          this.flash.alpha = 1;
        }
      }
    }
    if (this.kind === "storm") {
      this.flash.alpha = Math.max(0, this.flash.alpha - deltaMS * 0.0035);
    } else {
      this.flash.alpha = 0;
    }
  }

  destroy(): void {
    // Weather textures are cached module-side and shared by every scene. Do
    // not let a scene teardown destroy the texture sources.
    for (const child of this.container.removeChildren()) {
      child.destroy({ texture: false, textureSource: false });
    }
    this.container.destroy();
  }
}
