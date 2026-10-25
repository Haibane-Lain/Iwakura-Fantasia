import { describe, expect, it } from "vitest";
import {
  projectPoint,
  projectVector,
  screenVectorToWorld,
  unprojectPoint,
  worldVectorToScreen,
} from "./projection";

describe("isometric projection", () => {
  it("round-trips points", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 34, y: 12 },
      { x: -118.5, y: 82.25 },
      { x: 1200, y: -430 },
    ]) {
      const back = unprojectPoint(projectPoint(point));
      expect(back.x).toBeCloseTo(point.x, 8);
      expect(back.y).toBeCloseTo(point.y, 8);
    }
  });

  it("keeps screen-right movement pointing right on screen", () => {
    const world = screenVectorToWorld(1, 0);
    const screen = worldVectorToScreen(world.x, world.y);
    expect(screen.x).toBeCloseTo(1, 8);
    expect(screen.y).toBeCloseTo(0, 8);
  });

  it("maps world east and south to different screen diagonals", () => {
    const east = projectVector(1, 0);
    const south = projectVector(0, 1);
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeGreaterThan(0);
    expect(south.x).toBeLessThan(0);
    expect(south.y).toBeGreaterThan(0);
  });

  it("lifts height straight up the screen", () => {
    const ground = projectPoint({ x: 90, y: 40 });
    const raised = projectPoint({ x: 90, y: 40 }, 30);
    expect(raised.x).toBeCloseTo(ground.x, 8);
    expect(raised.y).toBeLessThan(ground.y);
  });
});
