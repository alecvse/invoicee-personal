import { describe, expect, it } from "vitest";
import {
  buildSparklineAreaPath,
  buildSparklineLinePath,
  buildSparklineSegments,
  type SparklinePoint
} from "./sparklinePath";

function cubicBezierPoint(
  start: SparklinePoint,
  control1: SparklinePoint,
  control2: SparklinePoint,
  end: SparklinePoint,
  t: number
): SparklinePoint {
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const tSquared = t * t;

  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * t * control1.x +
      3 * inverse * tSquared * control2.x +
      tSquared * t * end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * t * control1.y +
      3 * inverse * tSquared * control2.y +
      tSquared * t * end.y
  };
}

describe("sparklinePath", () => {
  it("returns empty paths for empty input", () => {
    expect(buildSparklineLinePath([])).toBe("");
    expect(buildSparklineAreaPath([], 34)).toBe("");
  });

  it("builds a cubic path for multi-point data", () => {
    const points: SparklinePoint[] = [
      { x: 0, y: 18 },
      { x: 25, y: 11 },
      { x: 50, y: 15 },
      { x: 75, y: 8 },
      { x: 100, y: 12 }
    ];

    const linePath = buildSparklineLinePath(points);

    expect(linePath.startsWith("M 0 18")).toBe(true);
    expect(linePath).toContain("C");
    expect(linePath).not.toContain("L ");
    expect(buildSparklineAreaPath(points, 32)).toMatch(/Z$/);
  });

  it("keeps monotone data smooth without overshoot", () => {
    const points: SparklinePoint[] = [
      { x: 0, y: 42 },
      { x: 20, y: 35 },
      { x: 40, y: 28 },
      { x: 60, y: 20 },
      { x: 80, y: 12 },
      { x: 100, y: 6 }
    ];

    const segments = buildSparklineSegments(points);
    const sampledYValues: number[] = [];

    for (const segment of segments) {
      for (let step = 0; step <= 20; step += 1) {
        sampledYValues.push(cubicBezierPoint(segment.start, segment.control1, segment.control2, segment.end, step / 20).y);
      }
    }

    for (let index = 1; index < sampledYValues.length; index += 1) {
      expect(sampledYValues[index]).toBeLessThanOrEqual(sampledYValues[index - 1] + 1e-6);
    }
  });
});
