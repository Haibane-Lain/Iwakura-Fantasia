import type { Point } from "@iwakura/engine";
import type { Application, Container } from "pixi.js";
import type { IsoBounds } from "./layout";
import { type IsoPoint, unprojectPoint } from "./projection";

export interface CameraFitOptions {
  padding?: number;
  minScale?: number;
  maxScale?: number;
}

export function fitIsoCamera(
  app: Application,
  camera: Container,
  bounds: IsoBounds,
  focus: IsoPoint,
  options: CameraFitOptions = {},
): number {
  const padding = options.padding ?? 48;
  const mapWidth = Math.max(1, bounds.maxX - bounds.minX);
  const mapHeight = Math.max(1, bounds.maxY - bounds.minY);
  const fitScale = Math.min(
    (app.screen.width - padding * 2) / mapWidth,
    (app.screen.height - padding * 2) / mapHeight,
  );
  const scale = Math.max(options.minScale ?? 0.35, Math.min(options.maxScale ?? 1.75, fitScale));
  camera.scale.set(scale);
  camera.position.set(app.screen.width / 2 - focus.x * scale, app.screen.height / 2 - focus.y * scale);
  clampIsoCamera(app, camera, bounds);
  return scale;
}

export function followIsoCamera(
  app: Application,
  camera: Container,
  bounds: IsoBounds,
  focus: IsoPoint,
): void {
  const scale = camera.scale.x;
  camera.position.set(app.screen.width / 2 - focus.x * scale, app.screen.height / 2 - focus.y * scale);
  clampIsoCamera(app, camera, bounds);
}

export function clampIsoCamera(app: Application, camera: Container, bounds: IsoBounds): void {
  const screenWidth = app.screen.width;
  const screenHeight = app.screen.height;
  const scale = camera.scale.x;
  const mapWidth = (bounds.maxX - bounds.minX) * scale;
  const mapHeight = (bounds.maxY - bounds.minY) * scale;
  let x = camera.position.x;
  let y = camera.position.y;
  x =
    mapWidth <= screenWidth
      ? screenWidth / 2 - ((bounds.minX + bounds.maxX) / 2) * scale
      : Math.max(screenWidth - bounds.maxX * scale, Math.min(-bounds.minX * scale, x));
  y =
    mapHeight <= screenHeight
      ? screenHeight / 2 - ((bounds.minY + bounds.maxY) / 2) * scale
      : Math.max(screenHeight - bounds.maxY * scale, Math.min(-bounds.minY * scale, y));
  camera.position.set(x, y);
}

export function screenToIso(camera: Container, screenX: number, screenY: number): IsoPoint {
  return {
    x: (screenX - camera.position.x) / camera.scale.x,
    y: (screenY - camera.position.y) / camera.scale.y,
  };
}

export function screenToWorld(camera: Container, screenX: number, screenY: number): Point {
  return unprojectPoint(screenToIso(camera, screenX, screenY));
}

export function isoToScreen(camera: Container, point: IsoPoint): IsoPoint {
  return {
    x: camera.position.x + point.x * camera.scale.x,
    y: camera.position.y + point.y * camera.scale.y,
  };
}
