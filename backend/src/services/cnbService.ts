const CNB_DAILY_URL =
  "https://www.cnb.cz/en/financial-markets/foreign-exchange-market/central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/daily.txt";

const CNB_TIMEOUT_MS = 5000;
const MAX_LOOKBACK_DAYS = 10;

export type CnbRateResult = {
  code: string;
  rateCzk: number;
  rateDate: string;
};

const rateCache = new Map<string, number>();

function formatCnbDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseRate(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAmount(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchDailyRates(date: Date): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CNB_TIMEOUT_MS);
  const dateParam = formatCnbDate(date);
  const url = `${CNB_DAILY_URL}?date=${encodeURIComponent(dateParam)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/plain" },
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractRateFromDailyText(code: string, text: string): number | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (!line.includes("|")) {
      continue;
    }
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 5) {
      continue;
    }

    const currencyCode = parts[3].toUpperCase();
    if (currencyCode !== code) {
      continue;
    }

    const amount = parseAmount(parts[2]);
    const rawRate = parseRate(parts[4]);
    if (!amount || rawRate === null) {
      return null;
    }

    return rawRate / amount;
  }

  return null;
}

export async function getCnbRateForDate(currencyCode: string, date: Date): Promise<CnbRateResult> {
  const code = currencyCode.trim().toUpperCase();

  for (let offset = 0; offset <= MAX_LOOKBACK_DAYS; offset++) {
    const candidate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offset));
    const key = `${code}:${isoDate(candidate)}`;

    const cached = rateCache.get(key);
    if (cached !== undefined) {
      return { code, rateCzk: cached, rateDate: isoDate(candidate) };
    }

    const text = await fetchDailyRates(candidate);
    if (!text) {
      continue;
    }

    const rate = extractRateFromDailyText(code, text);
    if (rate === null) {
      continue;
    }

    rateCache.set(key, rate);
    return { code, rateCzk: rate, rateDate: isoDate(candidate) };
  }

  throw new Error(`CNB rate for ${code} is unavailable`);
}

export function resetCnbRateCacheForTests() {
  rateCache.clear();
}
