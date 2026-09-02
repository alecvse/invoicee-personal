import { buildSparklineLinePath, type SparklinePoint } from "../components/sparklinePath";
import type { DashboardStats } from "../api/types";

const CHART_WIDTH = 100;
const CHART_HEIGHT = 100;
const PADDING_X = 4;
const PADDING_Y = 3;

export type DashboardMonthlyChartEntry = {
  label: string;
  czk: number;
  usd: number;
  usdCzk: number;
  totalCzk: number;
};

export type DashboardAveragePoint = {
  label: string;
  amountCzk: number;
  xPercent: number;
  yPercent: number;
};

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type GradientStop = {
  offsetPercent: number;
  color: RgbColor;
};

const LIGHT_GRADIENT_STOPS: GradientStop[] = [
  { offsetPercent: 0, color: { r: 99, g: 102, b: 241 } },
  { offsetPercent: 54, color: { r: 168, g: 85, b: 247 } },
  { offsetPercent: 100, color: { r: 96, g: 165, b: 250 } }
];

const DARK_GRADIENT_STOPS: GradientStop[] = [
  { offsetPercent: 0, color: { r: 165, g: 180, b: 252 } },
  { offsetPercent: 54, color: { r: 196, g: 181, b: 253 } },
  { offsetPercent: 100, color: { r: 125, g: 211, b: 252 } }
];

function interpolateChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function interpolateColor(start: RgbColor, end: RgbColor, ratio: number): RgbColor {
  return {
    r: interpolateChannel(start.r, end.r, ratio),
    g: interpolateChannel(start.g, end.g, ratio),
    b: interpolateChannel(start.b, end.b, ratio)
  };
}

function formatRgbColor(color: RgbColor): string {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

export function getAveragePointColor(xPercent: number, isDarkTheme: boolean): string {
  const stops = isDarkTheme ? DARK_GRADIENT_STOPS : LIGHT_GRADIENT_STOPS;
  const clampedPercent = Math.min(Math.max(xPercent, 0), 100);

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];

    if (clampedPercent > current.offsetPercent) {
      continue;
    }

    const segmentRange = current.offsetPercent - previous.offsetPercent || 1;
    const ratio = (clampedPercent - previous.offsetPercent) / segmentRange;
    return formatRgbColor(interpolateColor(previous.color, current.color, ratio));
  }

  return formatRgbColor(stops[stops.length - 1]?.color ?? LIGHT_GRADIENT_STOPS[0].color);
}

export function buildDashboardMonthlyChart(
  monthlyCurrencyTotals: DashboardStats["monthlyCurrencyTotals"],
  monthLabels: string[]
): DashboardMonthlyChartEntry[] {
  return monthlyCurrencyTotals.map((entry, index) => ({
    label: monthLabels[index] ?? String(entry.month),
    czk: entry.czk,
    usd: entry.usd,
    usdCzk: entry.usdConvertedCzk ?? 0,
    totalCzk: entry.totalConvertedCzk ?? entry.czk
  }));
}

export function buildRunningAverageValues(monthlyChart: DashboardMonthlyChartEntry[]): number[] {
  let runningTotal = 0;

  return monthlyChart.map((entry, index) => {
    runningTotal += entry.totalCzk;
    return runningTotal / (index + 1);
  });
}

export function buildDashboardAverageLine(monthlyChart: DashboardMonthlyChartEntry[], chartMax: number): {
  points: DashboardAveragePoint[];
  linePath: string;
} | null {
  if (monthlyChart.length === 0 || chartMax <= 0) {
    return null;
  }

  const innerWidth = CHART_WIDTH - PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - PADDING_Y * 2;
  const runningAverageValues = buildRunningAverageValues(monthlyChart);

  const svgPoints: SparklinePoint[] = runningAverageValues.map((value, index) => {
    const x = PADDING_X + (monthlyChart.length === 1 ? innerWidth / 2 : (index / (monthlyChart.length - 1)) * innerWidth);
    const normalized = Math.min(Math.max(value / chartMax, 0), 1);
    const y = CHART_HEIGHT - PADDING_Y - normalized * innerHeight;

    return { x, y };
  });

  return {
    linePath: buildSparklineLinePath(svgPoints),
    points: svgPoints.map((point, index) => ({
      label: monthlyChart[index]?.label ?? String(index + 1),
      amountCzk: runningAverageValues[index] ?? 0,
      xPercent: (point.x / CHART_WIDTH) * 100,
      yPercent: (point.y / CHART_HEIGHT) * 100
    }))
  };
}
