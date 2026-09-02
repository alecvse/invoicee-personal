import { describe, expect, it } from "vitest";
import {
  buildDashboardAverageLine,
  buildDashboardMonthlyChart,
  getAveragePointColor,
  buildRunningAverageValues,
  type DashboardMonthlyChartEntry
} from "./dashboardAverageLine";

const monthLabels = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

describe("dashboardAverageLine", () => {
  it("builds cumulative running averages month by month", () => {
    const monthlyChart: DashboardMonthlyChartEntry[] = [
      { label: "Led", czk: 1200, usd: 0, usdCzk: 0, totalCzk: 1200 },
      { label: "Úno", czk: 600, usd: 0, usdCzk: 0, totalCzk: 600 },
      { label: "Bře", czk: 300, usd: 0, usdCzk: 0, totalCzk: 300 }
    ];

    expect(buildRunningAverageValues(monthlyChart)).toEqual([1200, 900, 700]);
  });

  it("uses totalConvertedCzk with fallback to czk when building chart values", () => {
    const monthlyChart = buildDashboardMonthlyChart(
      [
        { month: 1, czk: 1000, usd: 0, usdConvertedCzk: null, totalConvertedCzk: null },
        { month: 2, czk: 200, usd: 10, usdConvertedCzk: 240, totalConvertedCzk: 440 }
      ],
      monthLabels
    );

    expect(monthlyChart).toEqual([
      { label: "Led", czk: 1000, usd: 0, usdCzk: 0, totalCzk: 1000 },
      { label: "Úno", czk: 200, usd: 10, usdCzk: 240, totalCzk: 440 }
    ]);
  });

  it("returns null when there is no drawable max value", () => {
    const monthlyChart: DashboardMonthlyChartEntry[] = [
      { label: "Led", czk: 0, usd: 0, usdCzk: 0, totalCzk: 0 },
      { label: "Úno", czk: 0, usd: 0, usdCzk: 0, totalCzk: 0 }
    ];

    expect(buildDashboardAverageLine(monthlyChart, 0)).toBeNull();
  });

  it("creates a non-flat line when monthly values vary", () => {
    const monthlyChart: DashboardMonthlyChartEntry[] = [
      { label: "Led", czk: 100, usd: 0, usdCzk: 0, totalCzk: 100 },
      { label: "Úno", czk: 900, usd: 0, usdCzk: 0, totalCzk: 900 },
      { label: "Bře", czk: 300, usd: 0, usdCzk: 0, totalCzk: 300 }
    ];

    const averageLine = buildDashboardAverageLine(monthlyChart, 900);

    expect(averageLine).not.toBeNull();
    expect(averageLine?.points).toHaveLength(3);
    expect(averageLine?.points[0]?.yPercent).not.toBe(averageLine?.points[1]?.yPercent);
    expect(averageLine?.linePath.includes("C")).toBe(true);
  });

  it("resolves solid point color from the light gradient at a given position", () => {
    expect(getAveragePointColor(0, false)).toBe("rgb(99 102 241)");
    expect(getAveragePointColor(54, false)).toBe("rgb(168 85 247)");
    expect(getAveragePointColor(100, false)).toBe("rgb(96 165 250)");
  });

  it("resolves solid point color from the dark gradient at a given position", () => {
    expect(getAveragePointColor(0, true)).toBe("rgb(165 180 252)");
    expect(getAveragePointColor(54, true)).toBe("rgb(196 181 253)");
    expect(getAveragePointColor(100, true)).toBe("rgb(125 211 252)");
  });
});
