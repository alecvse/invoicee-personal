import { getCnbRateForDate } from "./cnbService.js";
import { buildWageHistory, fetchLatestWageArticle, fetchLatestWageArticles } from "./czsoService.js";
import type { WageHistoryPoint } from "./czsoService.js";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_RETRY_MS = 15 * 60 * 1000;

type CurrentRate = {
  rateCzk: number | null;
  rateDate: string | null;
};

type RateHistoryPoint = {
  date: string;
  valueCzk: number;
  rateDate: string;
};

export type CurrentMarketStats = {
  rates: {
    USD: CurrentRate;
    EUR: CurrentRate;
  };
  statistics: {
    medianWageCzk: number | null;
    medianWagePeriod: string | null;
    averageWageCzk: number | null;
    averageWagePeriod: string | null;
  };
  history: {
    rates: {
      USD: RateHistoryPoint[];
      EUR: RateHistoryPoint[];
    };
    statistics: {
      medianWageCzk: WageHistoryPoint[];
      averageWageCzk: WageHistoryPoint[];
    };
  };
  fetchedAt: string;
};

type CacheState = {
  freshUntil: number;
  lastAttemptAt: number;
  lastSuccess: CurrentMarketStats | null;
  inFlight: Promise<CurrentMarketStats> | null;
};

type CurrentRatesRefresh = {
  rates: CurrentMarketStats["rates"];
  hasFreshData: boolean;
};

type CurrentStatisticsRefresh = {
  statistics: CurrentMarketStats["statistics"];
  hasFreshData: boolean;
};

const cacheState: CacheState = {
  freshUntil: 0,
  lastAttemptAt: 0,
  lastSuccess: null,
  inFlight: null
};

function emptyRates(): CurrentMarketStats["rates"] {
  return {
    USD: { rateCzk: null, rateDate: null },
    EUR: { rateCzk: null, rateDate: null }
  };
}

function emptyStatistics(): CurrentMarketStats["statistics"] {
  return {
    medianWageCzk: null,
    medianWagePeriod: null,
    averageWageCzk: null,
    averageWagePeriod: null
  };
}

function emptyHistory(): CurrentMarketStats["history"] {
  return {
    rates: {
      USD: [],
      EUR: []
    },
    statistics: {
      medianWageCzk: [],
      averageWageCzk: []
    }
  };
}

function nowIso(): string {
  return new Date(Date.now()).toISOString();
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - days));
}

async function fetchRateHistory(code: "USD" | "EUR", baseDate: Date): Promise<RateHistoryPoint[]> {
  const result: RateHistoryPoint[] = [];
  const startDate = subtractUtcDays(baseDate, 29);
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const endTime = Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate());

  while (cursor.getTime() <= endTime) {
    const resolved = await getCnbRateForDate(code, cursor);
    result.push({
      date: isoDate(cursor),
      valueCzk: resolved.rateCzk,
      rateDate: resolved.rateDate
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function resolveRateResult(
  result: PromiseSettledResult<{ rateCzk: number; rateDate: string }>,
  fallback: CurrentRate | undefined
): CurrentRate {
  if (result.status === "fulfilled") {
    return {
      rateCzk: result.value.rateCzk,
      rateDate: result.value.rateDate
    };
  }

  return fallback ?? { rateCzk: null, rateDate: null };
}

async function fetchCurrentRates(fallback: CurrentMarketStats["rates"] | undefined): Promise<CurrentRatesRefresh> {
  const baseDate = new Date();
  const [usdResult, eurResult] = await Promise.allSettled([
    getCnbRateForDate("USD", baseDate),
    getCnbRateForDate("EUR", baseDate)
  ]);

  return {
    rates: {
      USD: resolveRateResult(usdResult, fallback?.USD),
      EUR: resolveRateResult(eurResult, fallback?.EUR)
    },
    hasFreshData: usdResult.status === "fulfilled" || eurResult.status === "fulfilled"
  };
}

async function fetchCurrentStatistics(
  fallback: CurrentMarketStats["statistics"] | undefined
): Promise<CurrentStatisticsRefresh> {
  const wageResult = await fetchLatestWageArticle();
  const hasMedianWage = wageResult.medianWageCzk !== null;
  const hasAverageWage = wageResult.averageWageCzk !== null;

  if (!hasMedianWage && !hasAverageWage) {
    throw new Error("Matching CZSO wage values not found");
  }

  return {
    statistics: {
      medianWageCzk: hasMedianWage ? wageResult.medianWageCzk : (fallback?.medianWageCzk ?? null),
      medianWagePeriod: hasMedianWage ? wageResult.period : (fallback?.medianWagePeriod ?? null),
      averageWageCzk: hasAverageWage ? wageResult.averageWageCzk : (fallback?.averageWageCzk ?? null),
      averageWagePeriod: hasAverageWage ? wageResult.period : (fallback?.averageWagePeriod ?? null)
    },
    hasFreshData: hasMedianWage || hasAverageWage
  };
}

async function fetchMarketHistory(): Promise<{ history: CurrentMarketStats["history"]; hasFreshData: boolean }> {
  const baseDate = new Date();
  const fallback = cacheState.lastSuccess?.history;
  const [usdHistoryResult, eurHistoryResult, wageArticlesResult] = await Promise.allSettled([
    fetchRateHistory("USD", baseDate),
    fetchRateHistory("EUR", baseDate),
    fetchLatestWageArticles()
  ]);

  const wageArticles = wageArticlesResult.status === "fulfilled" ? wageArticlesResult.value : null;

  return {
    history: {
      rates: {
        USD: usdHistoryResult.status === "fulfilled" ? usdHistoryResult.value : (fallback?.rates.USD ?? []),
        EUR: eurHistoryResult.status === "fulfilled" ? eurHistoryResult.value : (fallback?.rates.EUR ?? [])
      },
      statistics: {
        medianWageCzk: wageArticles
          ? buildWageHistory(wageArticles, (article) => article.medianWageCzk)
          : (fallback?.statistics.medianWageCzk ?? []),
        averageWageCzk: wageArticles
          ? buildWageHistory(wageArticles, (article) => article.averageWageCzk)
          : (fallback?.statistics.averageWageCzk ?? [])
      }
    },
    hasFreshData:
      usdHistoryResult.status === "fulfilled" ||
      eurHistoryResult.status === "fulfilled" ||
      wageArticlesResult.status === "fulfilled"
  };
}

async function refreshMarketStats(): Promise<CurrentMarketStats> {
  const fallback = cacheState.lastSuccess;
  const [ratesResult, statisticsResult, historyResult] = await Promise.allSettled([
    fetchCurrentRates(fallback?.rates),
    fetchCurrentStatistics(fallback?.statistics),
    fetchMarketHistory()
  ]);

  const ratesRefresh =
    ratesResult.status === "fulfilled"
      ? ratesResult.value
      : {
          rates: fallback?.rates ?? emptyRates(),
          hasFreshData: false
        };

  const statisticsRefresh =
    statisticsResult.status === "fulfilled"
      ? statisticsResult.value
      : {
          statistics: fallback?.statistics ?? emptyStatistics(),
          hasFreshData: false
        };

  const historyResultValue =
    historyResult.status === "fulfilled"
      ? historyResult.value
      : {
          history: fallback?.history ?? emptyHistory(),
          hasFreshData: false
        };

  if (
    fallback &&
    !ratesRefresh.hasFreshData &&
    !statisticsRefresh.hasFreshData &&
    !historyResultValue.hasFreshData
  ) {
    return fallback;
  }

  const payload: CurrentMarketStats = {
    rates: ratesRefresh.rates,
    statistics: statisticsRefresh.statistics,
    history: historyResultValue.history,
    fetchedAt: nowIso()
  };

  const hasAnyValue =
    payload.rates.USD.rateCzk !== null ||
    payload.rates.EUR.rateCzk !== null ||
    payload.statistics.medianWageCzk !== null ||
    payload.statistics.averageWageCzk !== null;

  if (!hasAnyValue) {
    throw new Error("Current market stats are unavailable");
  }

  cacheState.lastSuccess = payload;
  cacheState.freshUntil = Date.now() + CACHE_TTL_MS;

  return payload;
}

export async function getCurrentMarketStats(): Promise<CurrentMarketStats> {
  const now = Date.now();

  if (cacheState.lastSuccess && now < cacheState.freshUntil) {
    return cacheState.lastSuccess;
  }

  if (cacheState.inFlight) {
    return cacheState.inFlight;
  }

  if (cacheState.lastSuccess && now - cacheState.lastAttemptAt < STALE_RETRY_MS) {
    return cacheState.lastSuccess;
  }

  cacheState.lastAttemptAt = now;
  cacheState.inFlight = refreshMarketStats().finally(() => {
    cacheState.inFlight = null;
  });

  try {
    return await cacheState.inFlight;
  } catch (error) {
    if (cacheState.lastSuccess) {
      return cacheState.lastSuccess;
    }

    throw error;
  }
}

export function resetCurrentMarketStatsCacheForTests() {
  cacheState.freshUntil = 0;
  cacheState.lastAttemptAt = 0;
  cacheState.lastSuccess = null;
  cacheState.inFlight = null;
}
