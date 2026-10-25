import type { Application } from "pixi.js";
import { Container, Text } from "pixi.js";
import { isoToScreen } from "./camera";
import type { IsoPoint } from "./projection";

export interface IsoLabelOptions {
  color?: number;
  size?: number;
  anchorX?: number;
  anchorY?: number;
  offsetY?: number;
  minZoom?: number;
  strokeWidth?: number;
}

export interface LabelEntry {
  text: Text;
  point: IsoPoint;
  offsetX: number;
  offsetY: number;
  minZoom: number;
}

export function makeLabel(text: string, options: IsoLabelOptions = {}): Text {
  return new Text({
    text,
    style: {
      fontFamily: "Palatino Linotype, Georgia, serif",
      fontSize: options.size ?? 9,
      fill: options.color ?? 0xe9dfc8,
      stroke: { color: 0x080706, width: options.strokeWidth ?? 3 },
      align: "center",
    },
  });
}

/**
 * Labels live in screen space so they stay legible at every zoom level. The
 * layer must be attached to `app.stage` after the camera container.
 */
export class IsoLabelLayer {
  readonly container = new Container();
  private readonly entries: LabelEntry[] = [];

  constructor(private readonly app: Application) {
    this.app.stage.addChild(this.container);
  }

  add(
    text: Text,
    point: IsoPoint,
    options: Pick<IsoLabelOptions, "anchorX" | "anchorY" | "offsetY" | "minZoom"> = {},
  ): LabelEntry {
    text.anchor.set(options.anchorX ?? 0.5, options.anchorY ?? 1);
    this.container.addChild(text);
    const entry: LabelEntry = {
      text,
      point,
      offsetX: 0,
      offsetY: options.offsetY ?? 0,
      minZoom: options.minZoom ?? 0.45,
    };
    this.entries.push(entry);
    return entry;
  }

  setPoint(entry: LabelEntry, point: IsoPoint): void {
    entry.point = point;
  }

  remove(entry: LabelEntry): void {
    const index = this.entries.indexOf(entry);
    if (index >= 0) this.entries.splice(index, 1);
    entry.text.destroy();
  }

  update(camera: Container): void {
    const zoom = camera.scale.x;
    for (const entry of this.entries) {
      entry.text.visible = zoom >= entry.minZoom;
      if (!entry.text.visible) continue;
      const screen = isoToScreen(camera, entry.point);
      entry.text.position.set(screen.x + entry.offsetX, screen.y + entry.offsetY);
    }
  }

  clear(): void {
    for (const entry of this.entries) entry.text.destroy();
    this.entries.length = 0;
    this.container.removeChildren();
  }

  destroy(): void {
    this.clear();
    this.container.destroy({ children: true });
  }
}
