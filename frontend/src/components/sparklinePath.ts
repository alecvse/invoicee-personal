export type SparklinePoint = {
  x: number;
  y: number;
};

export type SparklineSegment = {
  start: SparklinePoint;
  control1: SparklinePoint;
  control2: SparklinePoint;
  end: SparklinePoint;
};

const EPSILON = 1e-9;
const CURVE_SMOOTHING = 0.78;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampToSlopeRange(value: number, slope: number): number {
  if (Math.abs(slope) < EPSILON) {
    return 0;
  }

  return clamp(value, Math.min(0, 3 * slope), Math.max(0, 3 * slope));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function buildMonotoneTangents(points: SparklinePoint[]): number[] {
  const count = points.length;
  if (count < 2) {
    return [];
  }

  const slopes: number[] = [];
  const widths: number[] = [];

  for (let index = 0; index < count - 1; index += 1) {
    const width = points[index + 1].x - points[index].x;
    const safeWidth = Math.abs(width) > EPSILON ? width : EPSILON;
    widths.push(safeWidth);
    slopes.push((points[index + 1].y - points[index].y) / safeWidth);
  }

  const tangents = new Array<number>(count).fill(0);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[slopes.length - 1];

  for (let index = 1; index < count - 1; index += 1) {
    const previousSlope = slopes[index - 1];
    const nextSlope = slopes[index];

    if (Math.abs(previousSlope) < EPSILON || Math.abs(nextSlope) < EPSILON || previousSlope * nextSlope <= 0) {
      tangents[index] = 0;
      continue;
    }

    const previousWidth = widths[index - 1];
    const nextWidth = widths[index];
    const denominator = previousWidth / previousSlope + nextWidth / nextSlope;
    tangents[index] = Math.abs(denominator) < EPSILON ? 0 : (previousWidth + nextWidth) / denominator;
  }

  tangents[0] = clampToSlopeRange(tangents[0], slopes[0]);
  tangents[count - 1] = clampToSlopeRange(tangents[count - 1], slopes[slopes.length - 1]);

  for (let index = 0; index < slopes.length; index += 1) {
    const slope = slopes[index];
    if (Math.abs(slope) < EPSILON) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }

    const a = tangents[index] / slope;
    const b = tangents[index + 1] / slope;
    const magnitude = a * a + b * b;

    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * a * slope;
      tangents[index + 1] = scale * b * slope;
    }
  }

  return tangents;
}

export function buildSparklineSegments(points: SparklinePoint[]): SparklineSegment[] {
  if (points.length < 2) {
    return [];
  }

  const tangents = buildMonotoneTangents(points);
  const segments: SparklineSegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const width = end.x - start.x;

    segments.push({
      start,
      control1: {
        x: start.x + width / 3,
        y: start.y + (tangents[index] * width * CURVE_SMOOTHING) / 3
      },
      control2: {
        x: end.x - width / 3,
        y: end.y - (tangents[index + 1] * width * CURVE_SMOOTHING) / 3
      },
      end
    });
  }

  return segments;
}

export function buildSparklineLinePath(points: SparklinePoint[]): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const [point] = points;
    return `M ${formatNumber(point.x)} ${formatNumber(point.y)}`;
  }

  const segments = buildSparklineSegments(points);
  const [firstPoint] = points;

  return [
    `M ${formatNumber(firstPoint.x)} ${formatNumber(firstPoint.y)}`,
    ...segments.map(
      (segment) =>
        `C ${formatNumber(segment.control1.x)} ${formatNumber(segment.control1.y)} ${formatNumber(segment.control2.x)} ${formatNumber(segment.control2.y)} ${formatNumber(segment.end.x)} ${formatNumber(segment.end.y)}`
    )
  ].join(" ");
}

export function buildSparklineAreaPath(points: SparklinePoint[], baselineY: number): string {
  if (points.length === 0) {
    return "";
  }

  const linePath = buildSparklineLinePath(points);
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return `${linePath} L ${formatNumber(lastPoint.x)} ${formatNumber(baselineY)} L ${formatNumber(firstPoint.x)} ${formatNumber(baselineY)} Z`;
}
