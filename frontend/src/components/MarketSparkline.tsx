import { useId, useMemo, useState } from "react";
import { buildSparklineAreaPath, buildSparklineLinePath } from "./sparklinePath";

export type MarketSparklinePoint = {
  label: string;
  value: number;
  subLabel?: string;
};

type MarketSparklineProps = {
  label: string;
  points: MarketSparklinePoint[];
  valueFormatter: (value: number) => string;
  variant?: "line" | "bar";
};

type TooltipState = {
  index: number;
  xPercent: number;
  yPercent: number;
};

type LineChartData = {
  kind: "line";
  areaPath: string;
  linePath: string;
};

type BarChartData = {
  kind: "bar";
  bars: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    xPercent: number;
    yPercent: number;
  }>;
};

type ChartData = {
  tooltipPositions: Array<{
    xPercent: number;
    yPercent: number;
  }>;
  svg: LineChartData | BarChartData;
};

const WIDTH = 100;
const HEIGHT = 36;
const PADDING_X = 2;
const PADDING_Y = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function xPercentForIndex(index: number, count: number): number {
  if (count <= 1) {
    return 50;
  }

  return (index / (count - 1)) * 100;
}

export function MarketSparkline({
  label,
  points,
  valueFormatter,
  variant = "line"
}: MarketSparklineProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const gradientId = useId().replace(/:/g, "");
  const barGradientId = `${gradientId}-bar`;
  const lineGradientId = `${gradientId}-line`;
  const fillGradientId = `${gradientId}-fill`;

  const chart = useMemo<ChartData | null>(() => {
    if (points.length === 0) {
      return null;
    }

    const values = points.map((point) => point.value);
    const innerWidth = WIDTH - PADDING_X * 2;
    const innerHeight = HEIGHT - PADDING_Y * 2;

    if (variant === "bar") {
      const max = Math.max(...values, 0);
      const safeMax = max || 1;
      const slotWidth = innerWidth / points.length;
      const barWidth = Math.max(slotWidth * 0.58, 4);

      const bars = points.map((point, index) => {
        const height = (point.value / safeMax) * innerHeight;
        const x = PADDING_X + index * slotWidth + (slotWidth - barWidth) / 2;
        const y = HEIGHT - PADDING_Y - height;
        const centerX = x + barWidth / 2;

        return {
          x,
          y,
          width: barWidth,
          height,
          xPercent: (centerX / WIDTH) * 100,
          yPercent: (y / HEIGHT) * 100
        };
      });

      return {
        tooltipPositions: bars.map((bar) => ({
          xPercent: bar.xPercent,
          yPercent: bar.yPercent
        })),
        svg: {
          kind: "bar",
          bars
        }
      };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const coordinates = points.map((point, index) => {
      const x = PADDING_X + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
      const normalized = (point.value - min) / range;
      const y = HEIGHT - PADDING_Y - normalized * innerHeight;

      return {
        x,
        y,
        xPercent: (x / WIDTH) * 100,
        yPercent: (y / HEIGHT) * 100
      };
    });

    const linePath = buildSparklineLinePath(coordinates);
    const areaPath = buildSparklineAreaPath(coordinates, HEIGHT - PADDING_Y);

    return {
      tooltipPositions: coordinates.map((coordinate) => ({
        xPercent: coordinate.xPercent,
        yPercent: coordinate.yPercent
      })),
      svg: {
        kind: "line",
        areaPath,
        linePath
      }
    };
  }, [points, variant]);

  function activateIndex(index: number) {
    if (!chart) {
      return;
    }

    const safeIndex = clamp(index, 0, points.length - 1);
    const position = chart.tooltipPositions[safeIndex];
    if (!position) {
      return;
    }

    setTooltip({
      index: safeIndex,
      xPercent: position.xPercent,
      yPercent: position.yPercent
    });
  }

  function activateByPointer(clientX: number, rect: DOMRect) {
    if (!chart || points.length === 0 || rect.width <= 0) {
      return;
    }

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const index = Math.round(ratio * Math.max(points.length - 1, 0));
    activateIndex(index);
  }

  if (!chart || points.length === 0) {
    return null;
  }

  const activePoint = tooltip ? points[tooltip.index] : null;

  return (
    <div
      className={`market-sparkline market-sparkline--${variant}`}
      tabIndex={0}
      role="img"
      aria-label={`${label}. Trend obsahuje ${points.length} bodů.`}
      onFocus={() => activateIndex(points.length - 1)}
      onBlur={() => setTooltip(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          activateIndex((tooltip?.index ?? points.length - 1) - 1);
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          activateIndex((tooltip?.index ?? points.length - 1) + 1);
        }
      }}
    >
      <div
        className="market-sparkline-canvas"
        onMouseMove={(event) => activateByPointer(event.clientX, event.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" preserveAspectRatio="none">
          <defs>
            <linearGradient id={barGradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={HEIGHT}>
              <stop className="market-sparkline-bar-stop-top" offset="0%" />
              <stop className="market-sparkline-bar-stop-bottom" offset="100%" />
            </linearGradient>
            <linearGradient id={lineGradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={WIDTH} y2="0">
              <stop className="market-sparkline-line-stop-start" offset="0%" />
              <stop className="market-sparkline-line-stop-mid" offset="54%" />
              <stop className="market-sparkline-line-stop-end" offset="100%" />
            </linearGradient>
            <linearGradient id={fillGradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={HEIGHT}>
              <stop className="market-sparkline-fill-stop-top" offset="0%" />
              <stop className="market-sparkline-fill-stop-bottom" offset="100%" />
            </linearGradient>
          </defs>
          {chart.svg.kind === "line" ? (
            <>
              <path className="market-sparkline-area" d={chart.svg.areaPath} fill={`url(#${fillGradientId})`} />
              <path className="market-sparkline-line" d={chart.svg.linePath} fill="none" stroke={`url(#${lineGradientId})`} />
            </>
          ) : (
            chart.svg.bars.map((bar, index) => (
              <rect
                key={`${points[index]?.label ?? index}`}
                className={`market-sparkline-bar${tooltip?.index === index ? " market-sparkline-bar-active" : ""}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx="1.8"
                fill={`url(#${barGradientId})`}
              />
            ))
          )}
        </svg>
        {tooltip ? (
          <>
            {variant === "line" ? (
              <span className="market-sparkline-guide" style={{ left: `${tooltip.xPercent}%` }} aria-hidden="true" />
            ) : null}
            <span
              className={`market-sparkline-marker${variant === "bar" ? " market-sparkline-marker-bar" : ""}`}
              style={{
                left: `${tooltip.xPercent}%`,
                top: `${tooltip.yPercent}%`
              }}
              aria-hidden="true"
            />
          </>
        ) : null}
      </div>
      {tooltip && activePoint ? (
        <div className="market-sparkline-tooltip summary-chart-tooltip" style={{ left: `${tooltip.xPercent}%` }}>
          <div className="summary-chart-tooltip-value">{valueFormatter(activePoint.value)}</div>
          <div className="summary-chart-tooltip-sub">{activePoint.label}</div>
          {activePoint.subLabel ? <div className="summary-chart-tooltip-sub">{activePoint.subLabel}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
