import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { CurrentMarketStats, DashboardStats } from "../api/types";
import { MarketSparkline } from "../components/MarketSparkline";
import { buildDashboardAverageLine, buildDashboardMonthlyChart, getAveragePointColor } from "./dashboardAverageLine";
import {
  formatDateCz,
  formatExchangeRate,
  formatInvoiceNumber,
  formatMoney
} from "../utils/format";
import czCircleFlag from "../assets/flags/cz-circle.svg";
import usCircleFlag from "../assets/flags/us-circle.svg";
import { StatusBadge } from "../components/StatusBadge";

const monthLabels = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

type ChartTooltip = {
  amountCzk: number;
  amountUsd?: number;
  prefix?: string;
  x: number;
  y: number;
};

function formatQuarterLabel(value: string): string {
  const match = value.match(/(\d+)\.\s*čtvrtletí\s+(\d{4})/i);
  if (!match) {
    return value;
  }

  return `Q${match[1]} ${match[2]}`;
}

export function DashboardPage() {
  const averageLineGradientId = useId().replace(/:/g, "");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [marketStats, setMarketStats] = useState<CurrentMarketStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [markingInvoiceId, setMarkingInvoiceId] = useState<string | null>(null);
  const [chartTooltip, setChartTooltip] = useState<ChartTooltip | null>(null);
  const [isAverageOverlayVisible, setIsAverageOverlayVisible] = useState(true);
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("theme-dark") : false
  );

  useEffect(() => {
    api.stats
      .byYear(year)
      .then((result) => {
        setStats(result);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [year]);

  useEffect(() => {
    api.stats
      .currentMarket()
      .then((result) => {
        setMarketStats(result);
        setMarketError(null);
      })
      .catch((e: Error) => {
        setMarketStats(null);
        setMarketError(e.message);
      });
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    const root = document.documentElement;
    const syncTheme = () => setIsDarkTheme(root.classList.contains("theme-dark"));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  async function markInvoicePaid(invoiceId: string) {
    try {
      setMarkingInvoiceId(invoiceId);
      await api.invoices.markPaid(invoiceId, true);
      const refreshed = await api.stats.byYear(year);
      setStats(refreshed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarkingInvoiceId(null);
    }
  }

  const czkCards = useMemo(
    () => [
      { label: "Celkem fakturováno (CZK)", value: stats ? formatMoney(stats.currencyTotals.CZK.totalInvoiced, "CZK") : "-" },
      { label: "Celkem uhrazeno (CZK)", value: stats ? formatMoney(stats.currencyTotals.CZK.totalPaid, "CZK") : "-" },
      { label: "K úhradě (CZK)", value: stats ? formatMoney(stats.currencyTotals.CZK.outstanding, "CZK") : "-" },
      { label: "Počet faktur (CZK)", value: stats ? String(stats.currencyTotals.CZK.invoiceCount) : "-" }
    ],
    [stats]
  );

  const usdCards = useMemo(
    () => [
      {
        label: "Celkem fakturováno (USD)",
        value: stats ? formatMoney(stats.currencyTotals.USD.totalInvoiced, "USD") : "-",
        subValue:
          stats?.currencyTotals.USD.convertedToCzk
            ? formatMoney(stats.currencyTotals.USD.convertedToCzk.totalInvoiced, "CZK")
            : "Přepočet na Kč není dostupný"
      },
      {
        label: "Celkem uhrazeno (USD)",
        value: stats ? formatMoney(stats.currencyTotals.USD.totalPaid, "USD") : "-",
        subValue:
          stats?.currencyTotals.USD.convertedToCzk
            ? formatMoney(stats.currencyTotals.USD.convertedToCzk.totalPaid, "CZK")
            : "Přepočet na Kč není dostupný"
      },
      { label: "K úhradě (USD)", value: stats ? formatMoney(stats.currencyTotals.USD.outstanding, "USD") : "-" },
      { label: "Počet faktur (USD)", value: stats ? String(stats.currencyTotals.USD.invoiceCount) : "-" }
    ],
    [stats]
  );

  const historicalMedianWage = marketStats?.history.statistics.medianWageCzk.at(-1);
  const medianWageCzk = marketStats?.statistics.medianWageCzk ?? historicalMedianWage?.valueCzk;
  const medianWagePeriod = marketStats?.statistics.medianWageCzk == null
    ? historicalMedianWage?.sourcePeriod
    : marketStats.statistics.medianWagePeriod;

  const marketCards = useMemo(
    () => [
      {
        label: "Kurz CZK/USD",
        value:
          typeof marketStats?.rates.USD.rateCzk === "number" ? formatExchangeRate(marketStats.rates.USD.rateCzk, "USD") : "-",
        subValue: marketStats?.rates.USD.rateDate ? `ČNB, k ${formatDateCz(marketStats.rates.USD.rateDate)}` : "Dočasně nedostupné",
        history: marketStats?.history.rates.USD.map((point) => ({
          label: `ČNB, ${formatDateCz(point.date)}`,
          value: point.valueCzk,
          subLabel: point.rateDate !== point.date ? `Vyhlášený kurz z ${formatDateCz(point.rateDate)}` : undefined
        })),
        tooltipValueFormatter: (value: number) => formatExchangeRate(value, "USD"),
        sparklineLabel: "Vývoj kurzu CZK/USD za posledních 30 dní",
        chartVariant: "line" as const
      },
      {
        label: "Kurz CZK/EUR",
        value:
          typeof marketStats?.rates.EUR.rateCzk === "number" ? formatExchangeRate(marketStats.rates.EUR.rateCzk, "EUR") : "-",
        subValue: marketStats?.rates.EUR.rateDate ? `ČNB, k ${formatDateCz(marketStats.rates.EUR.rateDate)}` : "Dočasně nedostupné",
        history: marketStats?.history.rates.EUR.map((point) => ({
          label: `ČNB, ${formatDateCz(point.date)}`,
          value: point.valueCzk,
          subLabel: point.rateDate !== point.date ? `Vyhlášený kurz z ${formatDateCz(point.rateDate)}` : undefined
        })),
        tooltipValueFormatter: (value: number) => formatExchangeRate(value, "EUR"),
        sparklineLabel: "Vývoj kurzu CZK/EUR za posledních 30 dní",
        chartVariant: "line" as const
      },
      {
        label: "Mediánová mzda v ČR",
        value: typeof medianWageCzk === "number" ? formatMoney(medianWageCzk, "CZK") : "-",
        subValue: medianWagePeriod ? `ČSÚ, za ${medianWagePeriod}` : "Dočasně nedostupné",
        history: marketStats?.history.statistics.medianWageCzk.map((point) => ({
          label: formatQuarterLabel(point.sourcePeriod),
          value: point.valueCzk,
          subLabel: `ČSÚ, ${point.sourcePeriod}`
        })),
        tooltipValueFormatter: (value: number) => formatMoney(value, "CZK"),
        sparklineLabel: "Vývoj mediánové mzdy za poslední 2 roky",
        chartVariant: "bar" as const
      },
      {
        label: "Průměrná hrubá mzda v ČR",
        value:
          typeof marketStats?.statistics.averageWageCzk === "number"
            ? formatMoney(marketStats.statistics.averageWageCzk, "CZK")
            : "-",
        subValue: marketStats?.statistics.averageWagePeriod
          ? `ČSÚ, ${marketStats.statistics.averageWagePeriod}`
          : "Dočasně nedostupné",
        history: marketStats?.history.statistics.averageWageCzk.map((point) => ({
          label: formatQuarterLabel(point.sourcePeriod),
          value: point.valueCzk,
          subLabel: `ČSÚ, ${point.sourcePeriod}`
        })),
        tooltipValueFormatter: (value: number) => formatMoney(value, "CZK"),
        sparklineLabel: "Vývoj průměrné mzdy za poslední 2 roky",
        chartVariant: "bar" as const
      }
    ],
    [marketStats, medianWageCzk, medianWagePeriod]
  );

  const monthlyChart = useMemo(() => {
    if (!stats) {
      return [];
    }

    return buildDashboardMonthlyChart(stats.monthlyCurrencyTotals, monthLabels);
  }, [stats]);

  const chartMax = useMemo(
    () => (monthlyChart.length > 0 ? Math.max(...monthlyChart.map((entry) => entry.totalCzk), 0) : 0),
    [monthlyChart]
  );

  const averageLine = useMemo(() => buildDashboardAverageLine(monthlyChart, chartMax), [chartMax, monthlyChart]);

  function showChartTooltip(
    target: HTMLElement,
    payload: Omit<ChartTooltip, "x" | "y">
  ) {
    const rect = target.getBoundingClientRect();
    setChartTooltip({
      ...payload,
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
  }

  return (
    <section>
      <div className="section-head">
        <h2>Přehled</h2>
        <div className="inline-controls">
          <input
            id="year"
            aria-label="Rok"
            type="number"
            className="w-40 shrink-0"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <Link to="/invoices/new" className="button shrink-0">
            Nová faktura
          </Link>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

          <article className="card summary-chart-card">
        <div className="summary-chart-head">
          <div>
            <p>Celkem fakturováno</p>
            <strong>
              {stats?.totalInvoicedCombinedCzk !== null && stats?.totalInvoicedCombinedCzk !== undefined
                ? formatMoney(stats.totalInvoicedCombinedCzk, "CZK")
                : "-"}
            </strong>
          </div>
          <div className="summary-chart-legend">
            <span className="legend-item">
              <span className="legend-dot legend-czk" />
              Kč
            </span>
            <span className="legend-item">
              <span className="legend-dot legend-usd" />
              USD (v Kč)
            </span>
            <label className="summary-chart-switch">
              <input
                type="checkbox"
                checked={isAverageOverlayVisible}
                onChange={(event) => setIsAverageOverlayVisible(event.target.checked)}
                aria-label="Zobrazit průměrnou křivku"
              />
              <span>Průměr</span>
            </label>
          </div>
        </div>
        <div className="summary-chart-bars">
          {isAverageOverlayVisible && averageLine ? (
            <div className="summary-chart-plot-overlay">
              <svg
                className="summary-chart-average-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={averageLineGradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
                    <stop className="market-sparkline-line-stop-start" offset="0%" />
                    <stop className="market-sparkline-line-stop-mid" offset="54%" />
                    <stop className="market-sparkline-line-stop-end" offset="100%" />
                  </linearGradient>
                </defs>
                <path className="summary-chart-average-line-border" d={averageLine.linePath} />
                <path
                  className="summary-chart-average-line"
                  d={averageLine.linePath}
                  style={{ stroke: `url(#${averageLineGradientId})` }}
                />
              </svg>
              {averageLine.points.map((point) => (
                <button
                  key={point.label}
                  type="button"
                  className="summary-chart-average-point"
                  style={{
                    left: `${point.xPercent}%`,
                    top: `${point.yPercent}%`
                  }}
                  onMouseEnter={(e) =>
                    showChartTooltip(e.currentTarget, {
                      amountCzk: point.amountCzk,
                      prefix: "Průměr"
                    })
                  }
                  onFocus={(e) =>
                    showChartTooltip(e.currentTarget, {
                      amountCzk: point.amountCzk,
                      prefix: "Průměr"
                    })
                  }
                  onMouseLeave={() => setChartTooltip(null)}
                  onBlur={() => setChartTooltip(null)}
                  aria-label={`${point.label}: průměrná měsíční částka ${formatMoney(point.amountCzk, "CZK")}`}
                >
                  <span
                    className="summary-chart-average-point-dot"
                    style={{ backgroundColor: getAveragePointColor(point.xPercent, isDarkTheme) }}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          ) : null}
          {monthlyChart.map((entry, index) => {
            const totalHeight = chartMax > 0 ? Math.max((entry.totalCzk / chartMax) * 100, 2) : 0;
            const czkPartHeight = entry.totalCzk > 0 ? (entry.czk / entry.totalCzk) * 100 : 0;
            const usdPartHeight = entry.totalCzk > 0 ? (entry.usdCzk / entry.totalCzk) * 100 : 0;
            const totalLabel = formatMoney(entry.totalCzk, "CZK");
            const isEmptyMonth = entry.totalCzk === 0;

            return (
              <div key={entry.label} className="summary-chart-col">
                <span
                  className={`summary-chart-label summary-chart-label-value${isEmptyMonth ? " summary-chart-label-empty" : ""}`}
                >
                  {totalLabel}
                </span>
                <div className="summary-chart-track">
                  <div
                    className="summary-chart-fill"
                    style={{
                      height: `${totalHeight}%`,
                      animationDelay: `${index * 60}ms`
                    }}
                  >
                    {czkPartHeight > 0 ? (
                      <button
                        type="button"
                        className="summary-chart-segment summary-chart-segment-czk"
                        style={{ height: `${czkPartHeight}%` }}
                        onMouseEnter={(e) =>
                          showChartTooltip(e.currentTarget, {
                            amountCzk: entry.czk
                          })
                        }
                        onFocus={(e) =>
                          showChartTooltip(e.currentTarget, {
                            amountCzk: entry.czk
                          })
                        }
                        onMouseLeave={() => setChartTooltip(null)}
                        onBlur={() => setChartTooltip(null)}
                        aria-label={`${entry.label}: Kč ${formatMoney(entry.czk, "CZK")}`}
                      />
                    ) : null}
                    {usdPartHeight > 0 ? (
                      <button
                        type="button"
                        className="summary-chart-segment summary-chart-segment-usd"
                        style={{ height: `${usdPartHeight}%` }}
                        onMouseEnter={(e) =>
                          showChartTooltip(e.currentTarget, {
                            amountCzk: entry.usdCzk,
                            amountUsd: entry.usd
                          })
                        }
                        onFocus={(e) =>
                          showChartTooltip(e.currentTarget, {
                            amountCzk: entry.usdCzk,
                            amountUsd: entry.usd
                          })
                        }
                        onMouseLeave={() => setChartTooltip(null)}
                        onBlur={() => setChartTooltip(null)}
                        aria-label={`${entry.label}: USD ${formatMoney(entry.usd, "USD")} (${formatMoney(entry.usdCzk, "CZK")})`}
                      />
                    ) : null}
                  </div>
                </div>
                <span className="summary-chart-label">{entry.label}</span>
              </div>
            );
          })}
        </div>
      </article>
      {chartTooltip
        ? createPortal(
            <div
              className="summary-chart-tooltip"
              style={{
                left: `${chartTooltip.x}px`,
                top: `${chartTooltip.y}px`
              }}
            >
              <div className="summary-chart-tooltip-value">
                {chartTooltip.prefix ? `${chartTooltip.prefix}: ` : ""}
                {formatMoney(chartTooltip.amountCzk, "CZK")}
              </div>
              {typeof chartTooltip.amountUsd === "number" ? (
                <div className="summary-chart-tooltip-sub">{formatMoney(chartTooltip.amountUsd, "USD")}</div>
              ) : null}
            </div>,
            document.body
          )
        : null}

      <h3 className="currency-section-title">
        <img src={czCircleFlag} width={24} height={24} alt="" aria-hidden="true" />
        Přehled CZK
      </h3>
      <div className="stats-grid">
        {czkCards.map((card) => (
          <article className="card" key={card.label}>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <h3 className="currency-section-title">
        <img src={usCircleFlag} width={24} height={24} alt="" aria-hidden="true" />
        Přehled USD
      </h3>
      <div className="stats-grid">
        {usdCards.map((card) => (
          <article className="card" key={card.label}>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            {"subValue" in card && card.subValue ? <p>{card.subValue}</p> : null}
          </article>
        ))}
      </div>

      <h3>Kurzy a statistiky</h3>
      {marketError ? <p className="error">{marketError}</p> : null}
      <div className="stats-grid">
        {marketCards.map((card) => (
          <article className="card market-stat-card" key={card.label}>
            <p>{card.label}</p>
            <strong>{card.value}</strong>
            <p>{card.subValue}</p>
            {card.history && card.history.length > 0 ? (
              <MarketSparkline
                label={card.sparklineLabel}
                points={card.history}
                valueFormatter={card.tooltipValueFormatter}
                variant={card.chartVariant}
              />
            ) : null}
          </article>
        ))}
      </div>

      <h3>Posledních 10 faktur</h3>
      <table>
        <thead>
          <tr>
            <th>Číslo</th>
            <th>Stav faktury</th>
            <th>Odběratel</th>
            <th>Datum vystavení</th>
            <th>Celkem</th>
            <th>Přepočet CZK</th>
            <th className="text-right" aria-label="Akce"></th>
          </tr>
        </thead>
        <tbody>
          {stats?.lastInvoices.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="table-invoice-cell">
                  <Link className="table-invoice-link" to={`/invoices/${row.id}`}>
                    {formatInvoiceNumber(row.invoiceNumber)}
                  </Link>
                </div>
              </td>
              <td>
                <StatusBadge status={row.statusDisplay ?? row.status} paidAt={row.paidAt} />
              </td>
              <td>{row.customer}</td>
              <td>{formatDateCz(row.issueDate)}</td>
              <td>
                <span className="font-semibold">{formatMoney(row.total, row.currency)}</span>
              </td>
              <td>
                {row.currency.trim().toUpperCase() === "USD" && row.convertedTotalCzk !== null
                  ? formatMoney(row.convertedTotalCzk, "CZK")
                  : "-"}
              </td>
              <td>
                <div className="table-status-actions">
                  {(row.statusDisplay ?? row.status) !== "paid" ? (
                    <button
                      className="button-sm"
                      type="button"
                      onClick={() => markInvoicePaid(row.id)}
                      disabled={markingInvoiceId === row.id}
                    >
                      {markingInvoiceId === row.id ? "Ukládám..." : "Uhrazeno"}
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
